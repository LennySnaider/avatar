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
 */

import { useCallback, useEffect, useState } from 'react'
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

interface TelegramSendContentDialogProps {
    isOpen: boolean
    onClose: () => void
    avatarId: string
    /** `agent_chats.id` — la conversación destino. */
    chatId: string
    /** Nombre del fan para la cabecera; opcional, es sólo copy. */
    fanLabel?: string | null
    onSent?: (result: TelegramSendContentResult) => void
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
}: TelegramSendContentDialogProps) => {
    const [items, setItems] = useState<PaidMediaItemView[]>([])
    const [isLoading, setIsLoading] = useState(false)
    // El fallo de carga se PINTA, no se traga: sin galería no hay nada que
    // enviar, y un diálogo vacío sin explicación parece "no tienes contenido".
    const [loadError, setLoadError] = useState<string | null>(null)
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
    const [starsOverride, setStarsOverride] = useState('')
    const [captionOverride, setCaptionOverride] = useState('')
    const [isSending, setIsSending] = useState(false)

    const freeItems = items.filter((i) => i.isFree)
    const paidItems = items.filter((i) => !i.isFree)
    const selectedItem = items.find((i) => i.id === selectedItemId) ?? null

    const pickItem = useCallback((item: PaidMediaItemView) => {
        setSelectedItemId(item.id)
        // El precio del catálogo es sólo el valor de partida del override; en
        // un gratis ni se enseña ni se manda (el servicio lo forzaría a 0).
        setStarsOverride(item.isFree ? '' : String(item.starPrice))
        setCaptionOverride(item.caption ?? '')
    }, [])

    useEffect(() => {
        if (!isOpen || !avatarId) return
        let cancelled = false
        setIsLoading(true)
        setLoadError(null)
        setSelectedItemId(null)
        setStarsOverride('')
        setCaptionOverride('')
        listPaidMediaItems(avatarId)
            .then((result) => {
                if (cancelled) return
                if (result.success && result.data) {
                    const enabled = result.data.filter((i) => i.enabled)
                    setItems(enabled)
                    // Preselección: el primero que haya, sin preferir gratis
                    // ni pago — quien envía elige, la pantalla no empuja.
                    if (enabled[0]) pickItem(enabled[0])
                } else {
                    setItems([])
                    setLoadError(result.error ?? 'Could not load the gallery.')
                }
            })
            .catch((e: unknown) => {
                if (cancelled) return
                setItems([])
                setLoadError(e instanceof Error ? e.message : String(e))
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [isOpen, avatarId, pickItem])

    const handleSend = async () => {
        const item = selectedItem
        if (!item) return

        const caption = captionOverride.trim() || undefined
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
        } finally {
            setIsSending(false)
        }
    }

    const priceInvalid = !!selectedItem && !selectedItem.isFree && parseStars(starsOverride) === null

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
                    ) : items.length === 0 ? (
                        <p className="text-sm text-gray-500">
                            No enabled content yet — add some in this avatar&apos;s Telegram
                            Gallery tab.
                        </p>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {freeItems.length > 0 && (
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">
                                        Free teasers — sent unlocked, no Stars
                                    </p>
                                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                                        {freeItems.map((item) => (
                                            <Thumb
                                                key={item.id}
                                                item={item}
                                                selected={item.id === selectedItemId}
                                                onPick={() => pickItem(item)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                            {paidItems.length > 0 && (
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">
                                        Paid content — locked behind Stars
                                    </p>
                                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                                        {paidItems.map((item) => (
                                            <Thumb
                                                key={item.id}
                                                item={item}
                                                selected={item.id === selectedItemId}
                                                onPick={() => pickItem(item)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
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
                                                ⭐ {selectedItem.starPrice}
                                            </Tag>
                                        )}
                                    </div>
                                    {!selectedItem.isFree && (
                                        <div>
                                            <p className="text-xs text-gray-500 mb-1">
                                                Price for this send (Stars, 1-25000)
                                            </p>
                                            <Input
                                                type="number"
                                                min={1}
                                                max={25000}
                                                value={starsOverride}
                                                onChange={(e) => setStarsOverride(e.target.value)}
                                            />
                                        </div>
                                    )}
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
        </Dialog>
    )
}

export default TelegramSendContentDialog
