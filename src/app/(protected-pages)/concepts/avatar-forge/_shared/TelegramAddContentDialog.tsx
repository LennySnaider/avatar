'use client'

/**
 * Alta de contenido en la galería de Telegram SIN salir de donde estés.
 *
 * Nace de un feedback del usuario (19-sep): al pulsar "Send content" en el
 * Inbox sólo se podía elegir entre lo ya dado de alta, y para añadir algo
 * había que irse al panel de Telegram del avatar y volver. Es el pendiente de
 * UX de siempre — "el Inbox manda, no brincar entre paneles".
 *
 * Vive en `_shared` junto a `TelegramSendContentDialog`, que es quien lo abre
 * desde el "+" de su rejilla de miniaturas.
 *
 * DEUDA ANOTADA A PROPÓSITO: este formulario es hermano del "Add from
 * generations" de `telegram/[slug]/_components/TelegramGallery.tsx`. No se han
 * unificado porque aquel recibe las generaciones YA resueltas por su
 * `page.tsx` (servidor) y escribe sobre la lista `items` de ese panel, así que
 * compartirlo obligaba a reescribir el alta de un panel que funciona, sin
 * forma de probarlo aquí. Lo que de verdad comparten —el rango de precio y
 * qué significa `isFree`— ya vive en un solo sitio (`@/lib/telegram/
 * mediaPricing` y `upsertPaidMediaItem`), que es donde importa no divergir.
 * Si se toca uno, mirar el otro.
 *
 * Las generaciones se piden AQUÍ y sólo al abrirse
 * (`listAvatarGenerationsForGallery`): ni el diálogo de envío ni sus dos
 * llamadores las tienen, y el Inbox no debe cargarlas para todos los hilos por
 * si alguien pulsa el "+".
 */

import { useEffect, useState } from 'react'
import { HiOutlineSparkles } from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Dialog from '@/components/ui/Dialog'
import Segment from '@/components/ui/Segment'
import Alert from '@/components/ui/Alert'
import Notification from '@/components/ui/Notification'
import Spinner from '@/components/ui/Spinner'
import toast from '@/components/ui/toast'
import {
    listAvatarGenerationsForGallery,
    upsertPaidMediaItem,
} from '@/services/AgentTelegramService'
import type {
    PaidMediaItemView,
    TelegramGenerationPickerItem,
} from '@/services/AgentTelegramService'
import { generateSocialCaption } from '@/services/GeminiService'
import { isValidStarPrice } from '@/lib/telegram/mediaPricing'

interface TelegramAddContentDialogProps {
    isOpen: boolean
    onClose: () => void
    avatarId: string
    /**
     * Siguiente hueco de `sort_order`, calculado por el llamador sobre la
     * lista que él ya tiene (mismo criterio que la galería: el máximo + 1, no
     * `length` — si algo se borró en medio, una longitud repetiría un índice
     * ya usado). No hay unicidad en esa columna, así que coincidir con un ítem
     * que el llamador no ve sólo empata el orden; no rompe nada.
     */
    nextSortOrder: number
    /** El ítem recién guardado, tal y como lo devuelve el servicio. */
    onAdded: (item: PaidMediaItemView) => void
}

/** El rango lo decide `mediaPricing.ts` —el mismo fichero puro que valida el
 *  servicio—, aquí sólo se traduce el texto del input a número. */
function parseStarPrice(raw: string): number | null {
    const n = Number(raw)
    return isValidStarPrice(n) ? n : null
}

const TelegramAddContentDialog = ({
    isOpen,
    onClose,
    avatarId,
    nextSortOrder,
    onAdded,
}: TelegramAddContentDialogProps) => {
    const [generations, setGenerations] = useState<
        TelegramGenerationPickerItem[]
    >([])
    const [isLoading, setIsLoading] = useState(false)
    // El fallo de carga se PINTA: sin generaciones no hay nada que dar de
    // alta, y una rejilla vacía sin explicación parece "no tienes nada".
    const [loadError, setLoadError] = useState<string | null>(null)

    const [selectedGenerationId, setSelectedGenerationId] = useState<
        string | null
    >(null)
    const [title, setTitle] = useState('')
    const [caption, setCaption] = useState('')
    const [starPrice, setStarPrice] = useState('50')
    // Arranca en "de pago", igual que el alta de la galería: dar de alta algo
    // gratis tiene que ser una decisión explícita, no el camino por defecto.
    const [isFree, setIsFree] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [isGeneratingAi, setIsGeneratingAi] = useState(false)
    const [aiError, setAiError] = useState<string | null>(null)

    useEffect(() => {
        if (!isOpen || !avatarId) return
        let cancelled = false
        // El formulario se limpia al ABRIR, no al cerrar: si se cerrase
        // limpiando, el parpadeo del reset se vería durante la animación de
        // salida del diálogo.
        setSelectedGenerationId(null)
        setTitle('')
        setCaption('')
        setStarPrice('50')
        setIsFree(false)
        setAiError(null)
        setIsLoading(true)
        setLoadError(null)
        listAvatarGenerationsForGallery(avatarId)
            .then((result) => {
                if (cancelled) return
                if (result.success && result.data) {
                    setGenerations(result.data)
                } else {
                    setGenerations([])
                    setLoadError(
                        result.error ?? 'Could not load your generations.',
                    )
                }
            })
            .catch((e: unknown) => {
                if (cancelled) return
                setGenerations([])
                setLoadError(e instanceof Error ? e.message : String(e))
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [isOpen, avatarId])

    // Título + caption de una vez (`withTitle: true`) sobre la generación ya
    // seleccionada. Tono pícaro porque es contenido para fans, igual que el
    // toggle 🌶️ del PostModal; `sceneDescription` es el PLAN B si Gemini veta
    // la imagen en la entrada (ver los comentarios de generateSocialCaption).
    const handleGenerateWithAi = async () => {
        const gen = generations.find((g) => g.id === selectedGenerationId)
        if (!gen) return
        setIsGeneratingAi(true)
        setAiError(null)
        try {
            const result = await generateSocialCaption({
                mediaUrl: gen.mediaUrl,
                mediaType: gen.mediaType,
                withTitle: true,
                spicy: true,
                language: 'es',
                draft: caption.trim() || undefined,
                sceneDescription: gen.prompt,
            })
            if (result.success) {
                setTitle(result.title ?? title)
                setCaption(result.caption ?? caption)
            } else {
                setAiError(result.error ?? 'AI generation failed')
            }
        } catch (err) {
            setAiError(err instanceof Error ? err.message : String(err))
        } finally {
            setIsGeneratingAi(false)
        }
    }

    const handleAdd = async () => {
        if (!selectedGenerationId) return
        const trimmedTitle = title.trim()
        if (!trimmedTitle) return
        // En un gratis el precio ni se pide ni se manda: el servicio lo fuerza
        // a 0 y el check de la tabla lo exige.
        const price = isFree ? 0 : parseStarPrice(starPrice)
        if (price === null) return

        setIsSaving(true)
        try {
            const result = await upsertPaidMediaItem({
                avatarId,
                generationId: selectedGenerationId,
                title: trimmedTitle,
                caption: caption.trim() || null,
                starPrice: price,
                isFree,
                // Se da de alta habilitado a propósito: se está añadiendo para
                // enviarlo AHORA mismo desde el diálogo que abrió este.
                enabled: true,
                sortOrder: nextSortOrder,
            })
            if (result.success && result.data) {
                toast.push(
                    <Notification type="success" title="Content added">
                        {result.data.title} is ready to send.
                    </Notification>,
                )
                onAdded(result.data)
            } else {
                // El límite de tamaño, el duplicado y cualquier otro motivo ya
                // vienen formateados por el servicio — se enseñan TAL CUAL.
                toast.push(
                    <Notification type="danger" title="Could not add content">
                        {result.error}
                    </Notification>,
                )
            }
        } catch (e) {
            // Un fallo de transporte (server action caída, red, error de
            // serialización) no llega como `{success:false}`: LANZA. Sin este
            // catch el `finally` reactivaría el botón como si no hubiera
            // pasado nada y el usuario no sabría si se guardó.
            toast.push(
                <Notification type="danger" title="Could not add content">
                    {e instanceof Error ? e.message : String(e)}
                </Notification>,
            )
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <Dialog
            isOpen={isOpen}
            width={640}
            onClose={onClose}
            onRequestClose={onClose}
        >
            {/* Cabecera y pie fijos, cuerpo scrolleable: mismo problema (y
                misma solución) que el resto de diálogos de Telegram — en móvil
                el formulario es más alto que el viewport y Cancel/Add quedaban
                fuera de alcance. */}
            <div className="flex flex-col max-h-[82vh]">
                <h5 className="mb-4 shrink-0">Add content</h5>
                <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar">
                    {isLoading ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Spinner size={20} /> Loading your generations…
                        </div>
                    ) : loadError ? (
                        <p className="text-sm text-red-500">{loadError}</p>
                    ) : generations.length === 0 ? (
                        <p className="text-sm text-gray-500">
                            No generations in this avatar&apos;s gallery yet.
                        </p>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <div>
                                <p className="text-xs text-gray-500 mb-1">
                                    Pick a generation
                                </p>
                                {/* max-h propio: dos scrolls anidados a
                                    propósito, la rejilla de miniaturas no debe
                                    empujar el resto del formulario fuera de la
                                    pantalla. */}
                                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
                                    {generations.map((gen) => (
                                        <button
                                            key={gen.id}
                                            type="button"
                                            title={gen.prompt}
                                            className={`relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${
                                                gen.id === selectedGenerationId
                                                    ? 'border-primary'
                                                    : 'border-transparent hover:border-primary/50'
                                            }`}
                                            onClick={() =>
                                                setSelectedGenerationId(gen.id)
                                            }
                                        >
                                            {gen.mediaType === 'VIDEO' ? (
                                                <video
                                                    crossOrigin="anonymous"
                                                    src={gen.mediaUrl}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <img
                                                    src={gen.mediaUrl}
                                                    alt="Generation"
                                                    className="w-full h-full object-cover"
                                                />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <p className="text-xs text-gray-500">
                                        Title
                                    </p>
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        loading={isGeneratingAi}
                                        disabled={
                                            isGeneratingAi ||
                                            !selectedGenerationId
                                        }
                                        icon={<HiOutlineSparkles />}
                                        onClick={handleGenerateWithAi}
                                    >
                                        {isGeneratingAi
                                            ? 'Generating…'
                                            : 'Generate with AI'}
                                    </Button>
                                </div>
                                <Input
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                />
                            </div>
                            {aiError && (
                                <Alert
                                    type="danger"
                                    showIcon
                                    duration={0}
                                    title="AI generation failed"
                                >
                                    {aiError}
                                </Alert>
                            )}
                            <div>
                                <p className="text-xs text-gray-500 mb-1">
                                    How it&apos;s sent
                                </p>
                                <Segment
                                    value={isFree ? 'free' : 'paid'}
                                    onChange={(val) =>
                                        setIsFree(val === 'free')
                                    }
                                >
                                    <Segment.Item value="free">
                                        Free teaser
                                    </Segment.Item>
                                    <Segment.Item value="paid">
                                        Paid
                                    </Segment.Item>
                                </Segment>
                            </div>
                            {isFree ? (
                                <p className="text-xs text-gray-400">
                                    Free teasers go out unlocked, once per fan —
                                    the agent uses them as a hook, never as the
                                    product.
                                </p>
                            ) : (
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">
                                        Price (Stars, 1-25000)
                                    </p>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={25000}
                                        value={starPrice}
                                        onChange={(e) =>
                                            setStarPrice(e.target.value)
                                        }
                                    />
                                </div>
                            )}
                            <div>
                                <p className="text-xs text-gray-500 mb-1">
                                    Caption (optional)
                                </p>
                                <Input
                                    textArea
                                    rows={3}
                                    value={caption}
                                    placeholder="Shown to the fan alongside the content…"
                                    onChange={(e) => setCaption(e.target.value)}
                                />
                            </div>
                            <p className="text-xs text-gray-400">
                                Photos up to 10 MB, videos up to 50 MB —
                                Telegram&apos;s own limit. Larger files are
                                rejected when you hit Add, with the exact size
                                shown.
                            </p>
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-end gap-2 mt-4 shrink-0">
                    <Button
                        variant="plain"
                        disabled={isSaving}
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="solid"
                        loading={isSaving}
                        disabled={
                            !selectedGenerationId ||
                            !title.trim() ||
                            (!isFree && parseStarPrice(starPrice) === null)
                        }
                        onClick={handleAdd}
                    >
                        Add
                    </Button>
                </div>
            </div>
        </Dialog>
    )
}

export default TelegramAddContentDialog
