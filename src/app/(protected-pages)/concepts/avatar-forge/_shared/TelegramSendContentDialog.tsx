'use client'

/**
 * Diálogo ÚNICO de "enviar contenido de Telegram a una conversación" — el de
 * pago (Stars) y el teaser gratis en la misma pantalla.
 *
 * Vive en `_shared` porque lo usan DOS sitios (feedback del usuario 17-sep:
 * "el Inbox manda", no brincar entre paneles):
 *
 *  - el Inbox principal (`inbox/_components/ThreadPane.tsx`), que es donde se
 *    conversa de verdad y por tanto donde se decide mandar algo;
 *  - la pestaña Conversations del panel de Telegram
 *    (`telegram/[slug]/_components/TelegramInbox.tsx`), que antes tenía su
 *    propia copia del formulario.
 *
 * Duplicarlo era garantizar que uno de los dos se quedara sin los teasers
 * gratis, o sin el tope de 25000 Stars, en la siguiente edición.
 *
 * La galería se pide AQUÍ (`listPaidMediaItems`) cada vez que se abre, en vez
 * de recibirla por props: el llamador del Inbox principal no tiene esa lista
 * (ni debería cargarla para todos los hilos por si acaso), y pedirla al abrir
 * también recoge lo que se acabe de dar de alta en la otra pestaña sin
 * recargar la página. Sólo se ofrece lo `enabled`: mismo criterio que
 * `deliverPaidMedia`/`deliverFreeMedia`, que rechazan un ítem deshabilitado
 * en el servidor — filtrarlo aquí ahorra el viaje de un envío condenado.
 *
 * Desde el 19-sep también se puede DAR DE ALTA aquí, con el "+" del final de
 * la rejilla (`TelegramAddContentDialog`): el usuario pidió no tener que
 * salirse al panel de Telegram para añadir una foto y volver. Lo recién dado
 * de alta queda ya seleccionado, listo para Send.
 *
 * Desde el 21-sep sirve también a los chats de FANVUE (`channel="fanvue"`):
 * la galería es compartida (pedido de Lenny), así que es la misma lista y la
 * misma clasificación gratis/pago. Cambian el precio —en $ por envío, mínimo
 * $3, en vez de Stars— y el envío (`sendGalleryItemToFanvue`): lo gratis sale
 * desbloqueado y lo de pago como PPV.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { HiOutlinePlus } from 'react-icons/hi'
import RoleCheck from '@/components/shared/RoleCheck'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Dialog from '@/components/ui/Dialog'
import Tag from '@/components/ui/Tag'
import Notification from '@/components/ui/Notification'
import Spinner from '@/components/ui/Spinner'
import toast from '@/components/ui/toast'
import {
    listPaidMediaItems,
    sendFreeMediaFromInbox,
    sendPaidMediaFromInbox,
} from '@/services/AgentTelegramService'
import type { PaidMediaItemView } from '@/services/AgentTelegramService'
import { isValidStarPrice } from '@/lib/telegram/mediaPricing'
import { sendGalleryItemToFanvue } from '@/services/AgentInboxService'
import {
    centsToUsd,
    DEFAULT_PPV_CENTS,
    MIN_PPV_CENTS,
    parseUsdToCents,
} from '@/lib/fanvue/pricing'
import TelegramAddContentDialog from './TelegramAddContentDialog'

/** Lo que el llamador necesita saber de un envío que YA salió. Unión
 *  discriminada y no un objeto con campos opcionales: un teaser gratis no
 *  tiene `saleId` ni `stars` porque no hay venta que anclar, y un tipo que
 *  los declarase opcionales invitaría a pintar "0 Stars vendidos". */
export type TelegramSendContentResult =
    | {
          kind: 'paid'
          item: PaidMediaItemView
          saleId: string
          stars: number
          telegramMessageId: number
      }
    | {
          kind: 'free'
          item: PaidMediaItemView
          messageId: string
          telegramMessageId: number
      }
    | {
          /** Envío a un chat de Fanvue: gratis o PPV en centavos de USD. */
          kind: 'fanvue'
          item: PaidMediaItemView
          free: boolean
          priceCents: number | null
      }

interface TelegramSendContentDialogProps {
    isOpen: boolean
    onClose: () => void
    avatarId: string
    /** `agent_chats.id` — la conversación destino. */
    chatId: string
    /** Nombre del fan para la cabecera; opcional, es sólo copy. */
    fanLabel?: string | null
    onSent?: (result: TelegramSendContentResult) => void
    /** Canal del chat destino. Default `telegram` (el panel de Telegram no
     *  lo pasa). En `fanvue` el precio va en $ y el envío es un PPV. */
    channel?: 'telegram' | 'fanvue'
}

/** El rango lo decide `mediaPricing.ts` — el mismo fichero puro que valida el
 *  servicio; aquí sólo se traduce el texto del input a número. */
function parseStars(raw: string): number | null {
    const n = Number(raw)
    return isValidStarPrice(n) ? n : null
}

const Thumb = ({
    item,
    selected,
    onPick,
}: {
    item: PaidMediaItemView
    selected: boolean
    onPick: () => void
}) => (
    <button
        type="button"
        onClick={onPick}
        title={item.title}
        className={`relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${
            selected ? 'border-primary' : 'border-transparent hover:border-primary/50'
        }`}
    >
        {item.mediaKind === 'video' ? (
            <video
                crossOrigin="anonymous"
                src={item.mediaUrl}
                className="w-full h-full object-cover"
            />
        ) : (
            <img src={item.mediaUrl} alt={item.title} className="w-full h-full object-cover" />
        )}
    </button>
)

const TelegramSendContentDialog = ({
    isOpen,
    onClose,
    avatarId,
    chatId,
    fanLabel,
    onSent,
    channel = 'telegram',
}: TelegramSendContentDialogProps) => {
    const isFanvue = channel === 'fanvue'
    const [items, setItems] = useState<PaidMediaItemView[]>([])
    const [isLoading, setIsLoading] = useState(false)
    // El fallo de carga se PINTA, no se traga: sin galería no hay nada que
    // enviar, y un diálogo vacío sin explicación parece "no tienes contenido".
    const [loadError, setLoadError] = useState<string | null>(null)
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
    const [starsOverride, setStarsOverride] = useState('')
    // Precio en $ de un PPV de Fanvue, por envío (la galería guarda Stars).
    const [usdOverride, setUsdOverride] = useState('')
    const [captionOverride, setCaptionOverride] = useState('')
    const [isSending, setIsSending] = useState(false)
    // Qué se va a dar de alta: el "+" de cada sección abre el formulario ya
    // marcado como gratis o de pago (se puede cambiar dentro). null = cerrado.
    const [addKind, setAddKind] = useState<'free' | 'paid' | null>(null)
    // Testigo de carga. La galería ya no se pide sólo al abrir (también se
    // recarga tras dar de alta), así que el `cancelled` de un efecto no basta:
    // una respuesta lenta podía pisar a una más nueva y devolver la lista de
    // antes del alta. Gana siempre la última petición lanzada.
    const loadTokenRef = useRef(0)

    const freeItems = items.filter((i) => i.isFree)
    const paidItems = items.filter((i) => !i.isFree)
    const selectedItem = items.find((i) => i.id === selectedItemId) ?? null

    const pickItem = useCallback((item: PaidMediaItemView) => {
        setSelectedItemId(item.id)
        // El precio del catálogo es sólo el valor de partida del override; en
        // un gratis ni se enseña ni se manda (el servicio lo forzaría a 0).
        setStarsOverride(item.isFree ? '' : String(item.starPrice))
        setUsdOverride(item.isFree ? '' : centsToUsd(DEFAULT_PPV_CENTS))
        setCaptionOverride(item.caption ?? '')
    }, [])

    const clearSelection = useCallback(() => {
        setSelectedItemId(null)
        setStarsOverride('')
        setUsdOverride('')
        setCaptionOverride('')
    }, [])

    /** Pide la galería y deja seleccionado `selectId` si sigue estando (es lo
     *  que se acaba de dar de alta); si no, el primero que haya. */
    const loadItems = useCallback(
        async (selectId?: string) => {
            const token = ++loadTokenRef.current
            setIsLoading(true)
            setLoadError(null)
            try {
                const result = await listPaidMediaItems(avatarId)
                if (loadTokenRef.current !== token) return
                if (result.success && result.data) {
                    const enabled = result.data.filter((i) => i.enabled)
                    setItems(enabled)
                    // Preselección: lo recién añadido si lo hay; si no, el
                    // primero, sin preferir gratis ni pago — quien envía
                    // elige, la pantalla no empuja.
                    const target =
                        (selectId
                            ? enabled.find((i) => i.id === selectId)
                            : undefined) ?? enabled[0]
                    if (target) pickItem(target)
                    else clearSelection()
                } else {
                    setItems([])
                    setLoadError(result.error ?? 'Could not load the gallery.')
                }
            } catch (e) {
                if (loadTokenRef.current !== token) return
                setItems([])
                setLoadError(e instanceof Error ? e.message : String(e))
            } finally {
                if (loadTokenRef.current === token) setIsLoading(false)
            }
        },
        [avatarId, pickItem, clearSelection],
    )

    useEffect(() => {
        if (!isOpen || !avatarId) return
        clearSelection()
        void loadItems()
        return () => {
            // Invalida la petición en vuelo al cerrar o al cambiar de avatar:
            // el mismo papel que hacía el `cancelled` de antes.
            loadTokenRef.current += 1
        }
    }, [isOpen, avatarId, loadItems, clearSelection])

    /** El alta ya devolvió el ítem guardado, pero se recarga la galería en vez
     *  de empujarlo a mano: así la lista sale del servidor (única fuente) y de
     *  paso recoge lo que se haya dado de alta en otra pestaña. */
    const handleAdded = useCallback(
        (item: PaidMediaItemView) => {
            setAddKind(null)
            void loadItems(item.id)
        },
        [loadItems],
    )

    const handleSend = async () => {
        const item = selectedItem
        if (!item) return

        const caption = captionOverride.trim() || undefined
        if (isFanvue) {
            await sendToFanvue(item, caption)
            return
        }
        let stars: number | null = null
        if (!item.isFree) {
            stars = parseStars(starsOverride)
            if (stars === null) {
                toast.push(
                    <Notification type="danger" title="Invalid price">
                        Price must be a whole number between 1 and 25000 Stars.
                    </Notification>,
                )
                return
            }
        }

        setIsSending(true)
        try {
            if (item.isFree) {
                const result = await sendFreeMediaFromInbox({
                    avatarId,
                    chatId,
                    itemId: item.id,
                    caption,
                })
                if (result.success && result.data) {
                    toast.push(
                        <Notification type="success" title="Free teaser sent">
                            {item.title} went out to {fanLabel ?? 'this fan'}.
                        </Notification>,
                    )
                    onSent?.({
                        kind: 'free',
                        item,
                        messageId: result.data.messageId,
                        telegramMessageId: result.data.telegramMessageId,
                    })
                    onClose()
                } else {
                    toast.push(
                        <Notification type="danger" title="Could not send content">
                            {result.error}
                        </Notification>,
                    )
                }
                return
            }

            const result = await sendPaidMediaFromInbox({
                avatarId,
                chatId,
                itemId: item.id,
                stars: stars ?? undefined,
                caption,
            })
            if (result.success && result.data) {
                toast.push(
                    <Notification type="success" title="Content sent">
                        {result.data.stars} Stars offered to {fanLabel ?? 'this fan'}.
                    </Notification>,
                )
                onSent?.({
                    kind: 'paid',
                    item,
                    saleId: result.data.saleId,
                    stars: result.data.stars,
                    telegramMessageId: result.data.telegramMessageId,
                })
                onClose()
            } else {
                toast.push(
                    <Notification type="danger" title="Could not send content">
                        {result.error}
                    </Notification>,
                )
            }
        } catch (e) {
            // Un fallo de transporte (server action caída, red, error de
            // serialización) no llega como `{success:false}`: LANZA. Sin este
            // catch se quedaba en la consola y el `finally` reactivaba el botón
            // como si no hubiera pasado nada — el usuario no sabía si salió.
            toast.push(
                <Notification type="danger" title="Could not send content">
                    {e instanceof Error ? e.message : String(e)}
                </Notification>,
            )
        } finally {
            setIsSending(false)
        }
    }

    const sendToFanvue = async (item: PaidMediaItemView, caption?: string) => {
        const priceCents = item.isFree ? null : parseUsdToCents(usdOverride)
        if (!item.isFree && priceCents === null) {
            toast.push(
                <Notification type="danger" title="Invalid price">
                    PPV price must be at least ${centsToUsd(MIN_PPV_CENTS)}.
                </Notification>,
            )
            return
        }
        setIsSending(true)
        try {
            const result = await sendGalleryItemToFanvue({
                chatId,
                itemId: item.id,
                priceCents,
                caption,
            })
            if (result.success && result.data) {
                toast.push(
                    <Notification
                        type="success"
                        title={item.isFree ? 'Free content sent' : 'PPV sent'}
                    >
                        {item.isFree
                            ? `${item.title} went out to ${fanLabel ?? 'this fan'}.`
                            : `$${centsToUsd(priceCents ?? 0)} PPV offered to ${fanLabel ?? 'this fan'}.`}
                    </Notification>,
                )
                onSent?.({
                    kind: 'fanvue',
                    item,
                    free: result.data.free,
                    priceCents: result.data.priceCents,
                })
                onClose()
            } else {
                toast.push(
                    <Notification type="danger" title="Could not send content">
                        {result.error}
                    </Notification>,
                )
            }
        } catch (e) {
            // Mismo motivo que en `handleSend`: un fallo de transporte lanza.
            toast.push(
                <Notification type="danger" title="Could not send content">
                    {e instanceof Error ? e.message : String(e)}
                </Notification>,
            )
        } finally {
            setIsSending(false)
        }
    }

    const priceInvalid =
        !!selectedItem &&
        !selectedItem.isFree &&
        (isFanvue
            ? parseUsdToCents(usdOverride) === null
            : parseStars(starsOverride) === null)

    // Siguiente hueco libre, no `items.length`: si algo se borró en medio,
    // reusar una longitud como índice repetiría un sort_order ya usado (mismo
    // criterio que la galería). Aquí sólo se ven los `enabled`, así que puede
    // empatar con uno deshabilitado — la columna no es única y eso sólo empata
    // el orden, no falla.
    const nextSortOrder =
        items.reduce((max, i) => Math.max(max, i.sortOrder), -1) + 1

    /* Dos secciones SIEMPRE visibles, gratis y de pago, cada una con su "+"
       al final (una baldosa más, del tamaño de las miniaturas). Antes el "+"
       iba suelto fuera de los grupos y la sección gratis sólo aparecía si ya
       había algo gratis: con todo de pago no había forma de ver que existía
       contenido sin Stars (feedback de Lenny, 21-sep: "no todas llevan
       Stars"). El "+" de cada sección abre el formulario ya marcado con su
       tipo; se puede cambiar dentro.
       Con `pricing:manage` porque dar de alta fija un precio; es cosmético,
       `upsertPaidMediaItem` lo vuelve a comprobar. */
    const addTile = (kind: 'free' | 'paid') => (
        <RoleCheck permission="pricing:manage">
            <button
                type="button"
                title={
                    kind === 'free'
                        ? 'Add free content (no Stars)'
                        : 'Add paid content (Stars)'
                }
                className="w-16 h-16 shrink-0 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-400 hover:border-primary hover:text-primary transition-colors flex items-center justify-center"
                onClick={() => setAddKind(kind)}
            >
                <HiOutlinePlus className="text-2xl" />
            </button>
        </RoleCheck>
    )

    const section = (kind: 'free' | 'paid', list: PaidMediaItemView[]) => (
        <div>
            <p className="text-xs text-gray-500 mb-1">
                {kind === 'free'
                    ? isFanvue
                        ? 'Free — sent unlocked'
                        : 'Free — sent unlocked, no Stars'
                    : isFanvue
                      ? 'Paid — sent as PPV, priced in $'
                      : 'Paid — locked behind Stars'}
            </p>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                {list.map((item) => (
                    <Thumb
                        key={item.id}
                        item={item}
                        selected={item.id === selectedItemId}
                        onPick={() => pickItem(item)}
                    />
                ))}
                {addTile(kind)}
            </div>
            {list.length === 0 && (
                <p className="text-[11px] text-gray-400 mt-1">
                    {kind === 'free'
                        ? 'No free content yet — add a teaser the fan can see without paying.'
                        : isFanvue
                          ? 'No paid content yet — add something to sell as PPV.'
                          : 'No paid content yet — add something to sell for Stars.'}
                </p>
            )}
        </div>
    )

    return (
        <Dialog isOpen={isOpen} width={640} onClose={onClose} onRequestClose={onClose}>
            {/* Cabecera y pie fijos, cuerpo scrolleable: mismo problema (y
                misma solución) que los diálogos de la galería — en móvil el
                formulario es más alto que el viewport y Cancel/Send quedaban
                fuera de alcance. */}
            <div className="flex flex-col max-h-[82vh]">
                <div className="shrink-0">
                    <h5 className="mb-1">Send content</h5>
                    <p className="text-xs text-gray-400 mb-4">To {fanLabel ?? 'this fan'}</p>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar">
                    {isLoading ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Spinner size={20} /> Loading the gallery…
                        </div>
                    ) : loadError ? (
                        <p className="text-sm text-red-500">{loadError}</p>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {section('free', freeItems)}
                            {section('paid', paidItems)}
                            {selectedItem && (
                                <>
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-semibold">
                                            {selectedItem.title}
                                        </p>
                                        {selectedItem.isFree ? (
                                            <Tag className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100 border-0">
                                                Free
                                            </Tag>
                                        ) : (
                                            <Tag className="bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-100 border-0">
                                                {isFanvue
                                                    ? 'PPV'
                                                    : `⭐ ${selectedItem.starPrice}`}
                                            </Tag>
                                        )}
                                    </div>
                                    {!selectedItem.isFree &&
                                        (isFanvue ? (
                                            <div>
                                                <p className="text-xs text-gray-500 mb-1">
                                                    PPV price for this send ($, min{' '}
                                                    {centsToUsd(MIN_PPV_CENTS)})
                                                </p>
                                                <Input
                                                    inputMode="decimal"
                                                    prefix="$"
                                                    value={usdOverride}
                                                    onChange={(e) =>
                                                        setUsdOverride(e.target.value)
                                                    }
                                                />
                                            </div>
                                        ) : (
                                            <div>
                                                <p className="text-xs text-gray-500 mb-1">
                                                    Price for this send (Stars, 1-25000)
                                                </p>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    max={25000}
                                                    value={starsOverride}
                                                    onChange={(e) =>
                                                        setStarsOverride(e.target.value)
                                                    }
                                                />
                                            </div>
                                        ))}
                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">
                                            Caption for this send (optional)
                                        </p>
                                        <Input
                                            textArea
                                            rows={3}
                                            value={captionOverride}
                                            onChange={(e) => setCaptionOverride(e.target.value)}
                                        />
                                    </div>
                                    {selectedItem.isFree && (
                                        <p className="text-xs text-gray-400">
                                            Free teasers go out unlocked and unprotected — the fan
                                            can see and save them right away.
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-end gap-2 mt-4 shrink-0">
                    <Button variant="plain" onClick={onClose} disabled={isSending}>
                        Cancel
                    </Button>
                    <Button
                        variant="solid"
                        loading={isSending}
                        disabled={!selectedItem || priceInvalid}
                        onClick={handleSend}
                    >
                        Send
                    </Button>
                </div>
            </div>
            {/* Anidado sobre este diálogo a propósito: al cerrarlo el estado
                de aquí (ítem elegido, precio, caption) sigue intacto, y el
                recién dado de alta queda seleccionado para pulsar Send. */}
            <TelegramAddContentDialog
                isOpen={addKind !== null}
                avatarId={avatarId}
                nextSortOrder={nextSortOrder}
                defaultFree={addKind === 'free'}
                onClose={() => setAddKind(null)}
                onAdded={handleAdded}
            />
        </Dialog>
    )
}

export default TelegramSendContentDialog
