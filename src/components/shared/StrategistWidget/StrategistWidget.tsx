'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import {
    HiOutlineExternalLink,
    HiOutlinePlus,
    HiOutlineSparkles,
    HiOutlineTrash,
} from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import Input from '@/components/ui/Input'
import Notification from '@/components/ui/Notification'
import Select from '@/components/ui/Select'
import Skeleton from '@/components/ui/Skeleton'
import Tag from '@/components/ui/Tag'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import {
    deleteAssistantThread,
    getAssistantThread,
    getStrategistStatus,
    listAssistantThreads,
    startMetaConsent,
    type AssistantMessageView,
    type AssistantThreadSummary,
    type StrategistStatus,
} from '@/services/AssistantService'
import { screenFromPathname } from '@/lib/assistant/screen'
import StrategistMessages from './StrategistMessages'
import { useStrategistStore } from './useStrategistStore'
import type { UIMessage } from 'ai'

/**
 * F5.2 (Estratega) Task 5 — EL WIDGET: un botón flotante y un cajón lateral
 * desde los que se le pregunta al agente de la ORGANIZACIÓN, esté una donde
 * esté dentro de la aplicación.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTÁ MONTADO EN EL LAYOUT Y NO EN CADA PÁGINA
 * ─────────────────────────────────────────────────────────────────────────
 * Es UNA sola instancia, colgada de `(protected-pages)/layout.tsx`. Así la
 * conversación SOBREVIVE a la navegación: se puede preguntar algo en Social
 * Accounts, irse al Inbox mientras el turno stremea y seguir viendo la
 * respuesta. Montarlo por página significaría desmontar `useChat` en cada
 * clic y perder el turno a medias (además de abrir un hilo nuevo por
 * pantalla).
 *
 * `installed` VIENE DEL SERVIDOR, ya resuelto por el layout con
 * `hasModuleForOrg`. No se pregunta desde aquí: sería una llamada por
 * navegación para pintar nada el 100% de las veces que el módulo no está.
 * Con `installed: false` esto devuelve `null` — ni FAB, ni cajón, ni ninguna
 * llamada a `AssistantService`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LOS METADATOS DEL FLUJO: DE DÓNDE SALE EL `threadId`
 * ─────────────────────────────────────────────────────────────────────────
 * El cuerpo de cada petición lleva `{ threadId, screen }`, y `threadId` puede
 * ser `undefined` (conversación nueva). La ruta crea entonces el hilo y
 * devuelve su id en los metadatos del PRIMER chunk (`start`), que el SDK pega
 * en `metadata` del mensaje del asistente. Este componente lo ADOPTA en
 * cuanto aparece —no al terminar el turno— porque si esperase al `finish`,
 * dos preguntas seguidas antes de que acabe la primera abrirían DOS hilos.
 *
 * El mismo canal trae `consentUrl` cuando Meta no está conectado: es lo que
 * enciende la tarjeta "Connect Meta" sin necesidad de preguntar aparte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `getStrategistStatus()` SE LLAMA UNA VEZ POR APERTURA
 * ─────────────────────────────────────────────────────────────────────────
 * No es un `select`: acuña un reto de consentimiento contra Vercel Connect
 * (ver la cabecera de `AssistantService.ts`). Por eso el efecto que lo llama
 * depende sólo de `isOpen` y lleva un pestillo (`estadoPedidoRef`) que impide
 * que el doble montaje de React en desarrollo lo dispare dos veces. El
 * consumo de hoy que se ve en el pie es, por tanto, UNA FOTO del momento de
 * abrir: refrescarlo en cada turno multiplicaría los retos por el número de
 * preguntas.
 */

/** Lo que viaja en `metadata` del mensaje del asistente. Contrato de la ruta. */
interface AssistantTurnMetadata {
    threadId: string
    model: string | null
    consentUrl?: string
}

type StrategistUIMessage = UIMessage<AssistantTurnMetadata>

interface ThreadOption {
    value: string
    label: string
}

const CHAT_API = '/api/assistant/chat'

/** Un hilo sin título todavía no ha tenido su primera pregunta guardada. */
function threadLabel(thread: AssistantThreadSummary): string {
    if (thread.title && thread.title.trim().length > 0) return thread.title
    return `Untitled · ${new Date(thread.updatedAt).toLocaleDateString()}`
}

/**
 * El transporte lanza `new Error(await response.text())` cuando la ruta
 * contesta un error, así que el `message` es el JSON crudo del servidor.
 * Enseñárselo tal cual a una persona (`{"error":"..."}`) es enseñarle nuestras
 * tripas.
 */
function mensajeDeError(e: Error): string {
    const crudo = (e.message ?? '').trim()
    if (crudo.length === 0) return 'The Strategist could not answer.'
    if (crudo.startsWith('{')) {
        try {
            const cuerpo = JSON.parse(crudo) as {
                error?: unknown
                message?: unknown
            }
            if (typeof cuerpo.message === 'string' && cuerpo.message.length > 0)
                return cuerpo.message
            if (typeof cuerpo.error === 'string' && cuerpo.error.length > 0)
                return cuerpo.error
        } catch {
            // No era JSON después de todo: se usa el texto tal cual.
        }
    }
    return crudo
}

/**
 * Un turno guardado → `UIMessage`. El `content` de la base son las `parts` de
 * un UIMessage tal cual las escribió la ruta, así que no hay conversión: sólo
 * comprobación. Si algún día hubiera una fila con otra forma, se descarta CON
 * AVISO en vez de reventar el panel entero.
 */
function aUIMessage(m: AssistantMessageView): StrategistUIMessage | null {
    if (m.role === 'system') return null
    if (!Array.isArray(m.content)) {
        console.warn('[estratega] turno con `content` que no es un array', {
            messageId: m.id,
        })
        return null
    }
    return {
        id: m.id,
        role: m.role,
        parts: m.content as StrategistUIMessage['parts'],
    }
}

/**
 * Envoltura fina: iza la bandera `mounted` (de la que dependen los botones
 * contextuales) y corta en seco cuando el módulo no está instalado.
 */
const StrategistWidget = ({ installed }: { installed: boolean }) => {
    const setMounted = useStrategistStore((s) => s.setMounted)

    useEffect(() => {
        if (!installed) return
        setMounted(true)
        return () => setMounted(false)
    }, [installed, setMounted])

    if (!installed) return null
    return <StrategistPanel />
}

const StrategistPanel = () => {
    const pathname = usePathname()

    const isOpen = useStrategistStore((s) => s.isOpen)
    const threadId = useStrategistStore((s) => s.threadId)
    const prefill = useStrategistStore((s) => s.prefill)
    const open = useStrategistStore((s) => s.open)
    const close = useStrategistStore((s) => s.close)
    const setThread = useStrategistStore((s) => s.setThread)
    const setScreen = useStrategistStore((s) => s.setScreen)
    const consumePrefill = useStrategistStore((s) => s.consumePrefill)

    const [input, setInput] = useState('')
    const [threads, setThreads] = useState<AssistantThreadSummary[]>([])
    const [status, setStatus] = useState<StrategistStatus | null>(null)
    const [cargandoEstado, setCargandoEstado] = useState(false)
    const [cargandoHilo, setCargandoHilo] = useState(false)
    const [metaConnected, setMetaConnected] = useState(true)
    const [consentUrl, setConsentUrl] = useState<string | null>(null)
    const [conectando, setConectando] = useState(false)
    const [porBorrar, setPorBorrar] = useState<AssistantThreadSummary | null>(
        null,
    )
    const [borrando, setBorrando] = useState(false)

    const finalRef = useRef<HTMLDivElement>(null)
    /** Sigue vivo el componente? Guarda de todo `setState` asíncrono. */
    const vivoRef = useRef(true)
    /** Pestillo de "ya pedí el estado para esta apertura". */
    const estadoPedidoRef = useRef(false)

    useEffect(() => {
        vivoRef.current = true
        return () => {
            vivoRef.current = false
        }
    }, [])

    /**
     * El transporte se construye UNA VEZ y lee el hilo y la pantalla del store
     * en el momento del envío (`body` admite función, y el SDK la resuelve
     * justo antes del `fetch`). Leerlos de las props del render los congelaría
     * en el valor que tuvieran al construirse: el segundo mensaje viajaría con
     * `threadId: null` y abriría otro hilo.
     */
    const transport = useMemo(
        () =>
            new DefaultChatTransport<StrategistUIMessage>({
                api: CHAT_API,
                body: () => {
                    const { threadId: hilo, screen } =
                        useStrategistStore.getState()
                    return { threadId: hilo ?? undefined, screen }
                },
            }),
        [],
    )

    const recargarHilos = useCallback(async () => {
        const res = await listAssistantThreads()
        if (!vivoRef.current) return
        if (res.success) setThreads(res.data ?? [])
        // Un fallo aquí NO se convierte en toast: la lista de hilos es un
        // adorno junto a la conversación en curso, y `listAssistantThreads`
        // ya deja el motivo en el log del servidor.
    }, [])

    const {
        messages,
        sendMessage,
        status: chatStatus,
        error,
        setMessages,
    } = useChat<StrategistUIMessage>({
        transport,
        // El título del hilo se escribe en el servidor con la primera
        // pregunta: sin este refresco, la lista seguiría diciendo
        // "Untitled" hasta la siguiente apertura del panel.
        onFinish: () => {
            void recargarHilos()
        },
    })

    const ocupado = chatStatus === 'submitted' || chatStatus === 'streaming'

    // ── La pantalla sale de la ruta ──────────────────────────────────────
    // Sólo se dispara al montar y en cada cambio de ruta. Un botón contextual
    // que llame a `open({ screen })` no cambia la ruta, así que su pantalla
    // NO se pisa mientras la persona no navegue a otro sitio.
    useEffect(() => {
        setScreen(screenFromPathname(pathname))
    }, [pathname, setScreen])

    // ── Estado del módulo: una vez por apertura ──────────────────────────
    useEffect(() => {
        if (!isOpen) {
            estadoPedidoRef.current = false
            return
        }
        if (estadoPedidoRef.current) return
        estadoPedidoRef.current = true
        setCargandoEstado(true)
        void (async () => {
            const [estado] = await Promise.all([
                getStrategistStatus(),
                recargarHilos(),
            ])
            if (!vivoRef.current) return
            setCargandoEstado(false)
            if (!estado.success || !estado.data) {
                toast.push(
                    <Notification type="danger" title="Strategist unavailable">
                        {estado.error ?? 'Could not read the module status.'}
                    </Notification>,
                )
                return
            }
            setStatus(estado.data)
            setMetaConnected(estado.data.meta.connected)
            if (estado.data.meta.consentUrl) {
                setConsentUrl(estado.data.meta.consentUrl)
            }
        })()
    }, [isOpen, recargarHilos])

    // ── Adopción del threadId y de la URL de consentimiento ──────────────
    useEffect(() => {
        const ultimo = messages[messages.length - 1]
        if (!ultimo || ultimo.role !== 'assistant') return
        const meta = ultimo.metadata
        if (!meta) return
        if (
            meta.threadId &&
            meta.threadId !== useStrategistStore.getState().threadId
        ) {
            setThread(meta.threadId)
        }
        if (meta.consentUrl) {
            setConsentUrl(meta.consentUrl)
            setMetaConnected(false)
        }
    }, [messages, setThread])

    // ── Prefill de los botones contextuales ──────────────────────────────
    useEffect(() => {
        if (!isOpen || prefill === null) return
        const texto = consumePrefill()
        if (texto !== null) setInput(texto)
    }, [isOpen, prefill, consumePrefill])

    // ── Un error del turno se dice en voz alta ───────────────────────────
    useEffect(() => {
        if (!error) return
        toast.push(
            <Notification type="danger" title="The Strategist failed">
                {mensajeDeError(error)}
            </Notification>,
        )
    }, [error])

    useEffect(() => {
        if (isOpen) finalRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isOpen])

    const handleSend = () => {
        const texto = input.trim()
        if (!texto || ocupado) return
        setInput('')
        void sendMessage({ text: texto })
    }

    const handleNuevoHilo = () => {
        // NO se crea la fila aquí: la ruta abre el hilo con la primera
        // pregunta (y le pone título con ella). Crearlo ahora llenaría la
        // lista de hilos vacíos de quien abre el panel y se arrepiente.
        setThread(null)
        setMessages([])
        setInput('')
    }

    const handleElegirHilo = async (id: string) => {
        if (id === threadId || cargandoHilo) return
        setCargandoHilo(true)
        const res = await getAssistantThread(id)
        if (!vivoRef.current) return
        setCargandoHilo(false)
        if (!res.success || !res.data) {
            toast.push(
                <Notification type="danger" title="Could not open the thread">
                    {res.error ?? 'Unknown error'}
                </Notification>,
            )
            return
        }
        setThread(id)
        setScreen(res.data.thread.screen)
        setMessages(
            res.data.messages
                .map(aUIMessage)
                .filter((m): m is StrategistUIMessage => m !== null),
        )
    }

    const handleBorrar = async () => {
        if (!porBorrar) return
        setBorrando(true)
        const res = await deleteAssistantThread(porBorrar.id)
        if (!vivoRef.current) return
        setBorrando(false)
        if (!res.success) {
            toast.push(
                <Notification type="danger" title="Could not delete">
                    {res.error ?? 'Unknown error'}
                </Notification>,
            )
            return
        }
        const borrado = porBorrar.id
        setPorBorrar(null)
        setThreads((prev) => prev.filter((t) => t.id !== borrado))
        if (borrado === threadId) handleNuevoHilo()
        toast.push(
            <Notification type="success" title="Thread deleted">
                The conversation and its turns are gone.
            </Notification>,
        )
    }

    const handleConnectMeta = async () => {
        if (consentUrl) {
            window.open(consentUrl, '_blank', 'noopener,noreferrer')
            return
        }
        setConectando(true)
        const res = await startMetaConsent()
        if (!vivoRef.current) return
        setConectando(false)
        if (!res.success || !res.data) {
            toast.push(
                <Notification type="danger" title="Meta connection failed">
                    {res.error ?? 'Unknown error'}
                </Notification>,
            )
            return
        }
        if (res.data.connected) {
            setMetaConnected(true)
            setConsentUrl(null)
            return
        }
        setConsentUrl(res.data.url)
        window.open(res.data.url, '_blank', 'noopener,noreferrer')
    }

    const opcionesHilo: ThreadOption[] = threads.map((t) => ({
        value: t.id,
        label: threadLabel(t),
    }))
    const hiloActual = opcionesHilo.find((o) => o.value === threadId) ?? null
    const hiloSeleccionado = threads.find((t) => t.id === threadId) ?? null

    const usado = status?.usageToday.tokens ?? 0
    const tope = status?.settings.dailyTokenCap ?? 0

    return (
        <>
            <Button
                shape="circle"
                variant="solid"
                icon={<HiOutlineSparkles className="text-xl" />}
                className="fixed bottom-6 right-6 z-30 w-14 h-14 shadow-lg"
                // Etiqueta fija: mientras el cajón está abierto, el velo del
                // Drawer (z-40) tapa este botón, así que "cerrar" nunca es lo
                // que una persona lee aquí. Se cierra con la X o con el velo.
                aria-label="Ask the Strategist"
                onClick={() => (isOpen ? close() : open())}
            />

            <Drawer
                isOpen={isOpen}
                placement="right"
                width={420}
                title="Strategist"
                bodyClass="p-0! flex-1 min-h-0 flex flex-col overflow-hidden"
                onClose={close}
                onRequestClose={close}
            >
                {/* Hilos */}
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                        <Select<ThreadOption>
                            instanceId="strategist-threads"
                            size="sm"
                            placeholder={
                                opcionesHilo.length > 0
                                    ? 'Pick a conversation'
                                    : 'No conversations yet'
                            }
                            isDisabled={
                                ocupado ||
                                cargandoHilo ||
                                opcionesHilo.length === 0
                            }
                            options={opcionesHilo}
                            value={hiloActual}
                            onChange={(opt) => {
                                if (opt) void handleElegirHilo(opt.value)
                            }}
                        />
                    </div>
                    <Button
                        size="xs"
                        variant="plain"
                        icon={<HiOutlinePlus />}
                        disabled={ocupado}
                        aria-label="New thread"
                        onClick={handleNuevoHilo}
                    >
                        New
                    </Button>
                    <Button
                        size="xs"
                        variant="plain"
                        icon={<HiOutlineTrash />}
                        disabled={ocupado || !hiloSeleccionado}
                        aria-label="Delete this thread"
                        onClick={() => setPorBorrar(hiloSeleccionado)}
                    />
                </div>

                {/* Conversación */}
                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-3">
                    {cargandoHilo ? (
                        <>
                            <Skeleton height={48} />
                            <Skeleton height={64} />
                        </>
                    ) : messages.length === 0 ? (
                        <p className="text-sm text-gray-400">
                            Ask about your avatars, social accounts, inbox or
                            Meta Ads. The Strategist only reads — it never posts
                            or changes anything.
                        </p>
                    ) : (
                        <StrategistMessages messages={messages} />
                    )}
                    <div ref={finalRef} />
                </div>

                {/* Meta */}
                {!metaConnected && !cargandoEstado && (
                    <div className="mx-4 mb-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
                        <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                            Meta Ads is not connected, so ad numbers are out of
                            reach for now.
                        </p>
                        <Button
                            size="xs"
                            variant="solid"
                            loading={conectando}
                            icon={<HiOutlineExternalLink />}
                            onClick={() => void handleConnectMeta()}
                        >
                            Connect Meta
                        </Button>
                    </div>
                )}

                {/* Composición */}
                <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                    <Input
                        textArea
                        rows={3}
                        value={input}
                        placeholder="Ask the Strategist…"
                        disabled={ocupado}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                handleSend()
                            }
                        }}
                    />
                    <div className="flex items-center justify-between gap-2 mt-2">
                        <span className="text-[11px] text-gray-400">
                            {cargandoEstado ? (
                                'Loading usage…'
                            ) : (
                                <>
                                    {usado.toLocaleString()} tokens today · cap{' '}
                                    {tope.toLocaleString()}
                                </>
                            )}
                        </span>
                        <div className="flex items-center gap-2">
                            <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-600/40 dark:text-gray-100 border-0 text-[11px]">
                                read-only
                            </Tag>
                            <Button
                                size="sm"
                                variant="solid"
                                loading={ocupado}
                                disabled={input.trim().length === 0}
                                onClick={handleSend}
                            >
                                Send
                            </Button>
                        </div>
                    </div>
                </div>
            </Drawer>

            <ConfirmDialog
                isOpen={!!porBorrar}
                type="danger"
                title="Delete this conversation?"
                confirmText="Delete"
                confirmButtonProps={{ color: 'red', loading: borrando }}
                onClose={() => setPorBorrar(null)}
                onRequestClose={() => setPorBorrar(null)}
                onCancel={() => setPorBorrar(null)}
                onConfirm={() => void handleBorrar()}
            >
                <p>
                    {porBorrar ? threadLabel(porBorrar) : ''} and all of its
                    turns will be removed. This cannot be undone.
                </p>
            </ConfirmDialog>
        </>
    )
}

export default StrategistWidget
