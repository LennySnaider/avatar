'use client'

/**
 * Vigilante GLOBAL de los hilos que piden atención humana (2026-09-19).
 *
 * Se monta una sola vez en el layout protegido, al lado del widget del
 * Social Media Manager, para que viva en TODAS las páginas: el reporte que lo
 * motiva ("¿por qué dejó de contestar el bot?") era un hilo escalado por el
 * autopilot ("Paid media offer needs approval") del que nadie se enteró
 * porque `needs_attention` solo se veía dentro del Inbox, y solo con el Inbox
 * abierto. Mientras tanto el fan miraba un chat en silencio.
 *
 * Cómo avisa:
 *  - TOAST persistente (no se cierra solo) por cada hilo nuevo en atención,
 *    con el avatar, el fan, el motivo y un botón que lleva al Inbox.
 *  - SONIDO corto sintetizado con WebAudio: sin fichero de audio que servir y
 *    sin depender de que el navegador lo cachee. Solo puede sonar después de
 *    un gesto del usuario en la página (política de autoplay): el contexto se
 *    crea en el primer click/tecla y, si no lo hubo, el toast sale igual y el
 *    sonido simplemente no suena.
 *
 * Cómo se entera: SONDEO cada 20 s a una acción de servidor ligera. No hay
 * realtime en el navegador (la app no usa supabase-js en cliente ni la tabla
 * está publicada), y el Inbox ya sondea a 15 s por su cuenta. Se pausa con la
 * pestaña oculta y vuelve a mirar en cuanto se muestra.
 *
 * La decisión de "quién es nuevo" vive en `@/lib/agent/attentionWatch`, que
 * es puro y está probado.
 */

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import Button from '@/components/ui/Button'
import { listAttentionChats } from '@/services/AgentInboxService'
import type { AttentionChatItem } from '@/services/AgentInboxService'
import { diffAttention } from '@/lib/agent/attentionWatch'

const POLL_MS = 20_000
const INBOX_PATH = '/concepts/avatar-forge/inbox'

/**
 * Dos notas breves ascendentes (La5 → Re6), 350 ms en total. Es un "ping" de
 * mensajería, no una alarma: lo bastante corto para no molestar si llegan
 * varios seguidos.
 */
function playChime(ctx: AudioContext) {
    const now = ctx.currentTime
    const notes: Array<[number, number]> = [
        [880, 0],
        [1174.66, 0.16],
    ]
    for (const [freq, at] of notes) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, now + at)
        gain.gain.exponentialRampToValueAtTime(0.25, now + at + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.19)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now + at)
        osc.stop(now + at + 0.2)
    }
}

function describe(item: AttentionChatItem): string {
    const who = [item.avatarName, item.fanDisplayName]
        .filter(Boolean)
        .join(' · ')
    return who || item.platform
}

const AttentionWatcher = () => {
    const router = useRouter()
    const seenRef = useRef<ReadonlySet<string> | null>(null)
    const audioRef = useRef<AudioContext | null>(null)
    const inFlightRef = useRef(false)

    // Desbloqueo del audio: el contexto solo se puede crear/reanudar dentro
    // de un gesto del usuario. Basta el primero; después se reutiliza.
    useEffect(() => {
        const unlock = () => {
            if (audioRef.current) return
            try {
                const Ctor =
                    window.AudioContext ||
                    (
                        window as Window & {
                            webkitAudioContext?: typeof AudioContext
                        }
                    ).webkitAudioContext
                if (!Ctor) return
                const ctx = new Ctor()
                audioRef.current = ctx
                if (ctx.state === 'suspended') void ctx.resume()
            } catch (err) {
                // Sin audio no se rompe nada: el toast sigue saliendo.
                console.warn(
                    '[AttentionWatcher] AudioContext no disponible:',
                    err,
                )
            }
        }
        window.addEventListener('pointerdown', unlock, { once: true })
        window.addEventListener('keydown', unlock, { once: true })
        return () => {
            window.removeEventListener('pointerdown', unlock)
            window.removeEventListener('keydown', unlock)
        }
    }, [])

    const goToInbox = useCallback(
        (key: string) => {
            toast.remove(key)
            router.push(INBOX_PATH)
        },
        [router],
    )

    const notifyOne = useCallback(
        (item: AttentionChatItem) => {
            const key = toast.push(
                <Notification
                    type="warning"
                    title="Un hilo espera tu atención"
                    closable
                    duration={0}
                >
                    <div className="font-semibold">{describe(item)}</div>
                    {item.attentionReason && (
                        <div className="text-xs opacity-80 mt-0.5">
                            {item.attentionReason}
                        </div>
                    )}
                    <Button
                        size="xs"
                        variant="solid"
                        className="mt-2"
                        onClick={() => goToInbox(String(key))}
                    >
                        Ir al Inbox
                    </Button>
                </Notification>,
            )
        },
        [goToInbox],
    )

    const notifyBacklog = useCallback(
        (items: AttentionChatItem[]) => {
            const key = toast.push(
                <Notification
                    type="warning"
                    title="Hilos esperando tu atención"
                    closable
                    duration={12_000}
                >
                    <div>
                        {items.length === 1
                            ? `${describe(items[0])} espera una respuesta tuya.`
                            : `${items.length} hilos esperan una respuesta tuya.`}
                    </div>
                    <Button
                        size="xs"
                        variant="solid"
                        className="mt-2"
                        onClick={() => goToInbox(String(key))}
                    >
                        Ir al Inbox
                    </Button>
                </Notification>,
            )
        },
        [goToInbox],
    )

    const poll = useCallback(async () => {
        if (inFlightRef.current || document.visibilityState !== 'visible')
            return
        inFlightRef.current = true
        try {
            const res = await listAttentionChats()
            // Un fallo de red o de permisos no es un "no hay nada": se deja
            // el conjunto como estaba y se vuelve a intentar en el siguiente
            // ciclo. Marcar todo como visto tras un error silenciaría avisos.
            if (!res.success) return
            const { fresh, backlog, nextSeen } = diffAttention(
                seenRef.current,
                res.data ?? [],
            )
            seenRef.current = nextSeen
            if (backlog.length > 0) notifyBacklog(backlog)
            for (const item of fresh) notifyOne(item)
            const ctx = audioRef.current
            if (fresh.length > 0 && ctx && ctx.state === 'running') {
                playChime(ctx)
            }
        } finally {
            inFlightRef.current = false
        }
    }, [notifyBacklog, notifyOne])

    useEffect(() => {
        void poll()
        const timer = setInterval(() => void poll(), POLL_MS)
        const onVisible = () => {
            if (document.visibilityState === 'visible') void poll()
        }
        document.addEventListener('visibilitychange', onVisible)
        return () => {
            clearInterval(timer)
            document.removeEventListener('visibilitychange', onVisible)
        }
    }, [poll])

    return null
}

export default AttentionWatcher
