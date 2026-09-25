'use client'

/**
 * La llamada en vivo con el avatar: su cara en vídeo, subtítulos y los
 * botones de llamar / silenciar / colgar. La usan la pestaña Live del agente
 * (prueba interna) y la página pública `/live/[token]`.
 */
import Button from '@/components/ui/Button'
import Alert from '@/components/ui/Alert'
import { useLiveCall, type LiveBootstrap, type LiveCallStatus } from './useLiveCall'

export interface LiveAvatarCallProps {
    avatarName: string
    bootstrap: () => Promise<LiveBootstrap>
    apiBase?: string
    className?: string
}

const STATUS_LABEL: Record<LiveCallStatus, string> = {
    idle: 'Lista para llamar',
    connecting: 'Conectando…',
    listening: 'Te escucho',
    user_speaking: 'Hablando…',
    thinking: 'Pensando…',
    speaking: 'Respondiendo',
    ended: 'Llamada terminada',
    error: 'No se pudo conectar',
}

const LIVE_STATES: LiveCallStatus[] = ['connecting', 'listening', 'user_speaking', 'thinking', 'speaking']

function formatClock(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
}

const LiveAvatarCall = ({ avatarName, bootstrap, apiBase, className }: LiveAvatarCallProps) => {
    const call = useLiveCall({ bootstrap, apiBase })
    const inCall = LIVE_STATES.includes(call.status)
    const dotColor =
        call.status === 'speaking'
            ? 'bg-emerald-500'
            : call.status === 'user_speaking'
              ? 'bg-sky-500'
              : call.status === 'thinking' || call.status === 'connecting'
                ? 'bg-amber-400'
                : inCall
                  ? 'bg-emerald-300'
                  : 'bg-gray-400'

    return (
        <div className={className}>
            <div className="relative w-full max-w-md mx-auto aspect-[4/5] rounded-2xl overflow-hidden bg-gray-900">
                <video
                    ref={call.videoRef}
                    className="absolute inset-0 w-full h-full object-cover"
                    autoPlay
                    playsInline
                />
                <audio ref={call.audioRef} autoPlay />
                {!inCall && (
                    <div className="absolute inset-0 flex items-center justify-center text-center p-6">
                        <div>
                            <p className="text-white text-lg font-semibold">{avatarName}</p>
                            <p className="text-gray-300 text-sm mt-1">{STATUS_LABEL[call.status]}</p>
                        </div>
                    </div>
                )}
                <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1">
                    <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
                    <span className="text-xs text-white">{STATUS_LABEL[call.status]}</span>
                </div>
                {inCall && call.remainingSeconds !== null && (
                    <div className="absolute top-3 right-3 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
                        {formatClock(call.remainingSeconds)}
                    </div>
                )}
                {inCall && (call.avatarCaption || call.userCaption) && (
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-4 space-y-1">
                        {call.userCaption && <p className="text-xs text-gray-300">Tú: {call.userCaption}</p>}
                        {call.avatarCaption && <p className="text-sm text-white">{call.avatarCaption}</p>}
                    </div>
                )}
            </div>

            <div className="flex items-center justify-center gap-3 mt-4">
                {!inCall ? (
                    <Button variant="solid" onClick={() => void call.start()}>
                        {call.status === 'ended' || call.status === 'error' ? 'Llamar de nuevo' : 'Llamar'}
                    </Button>
                ) : (
                    <>
                        <Button onClick={call.toggleMute} disabled={call.status === 'connecting'}>
                            {call.muted ? 'Activar micrófono' : 'Silenciar'}
                        </Button>
                        <Button variant="solid" customColorClass={() => 'bg-red-600 hover:bg-red-500 text-white'} onClick={() => void call.hangUp()}>
                            Colgar
                        </Button>
                    </>
                )}
            </div>

            {call.error && (
                <Alert type="danger" showIcon className="mt-4 max-w-md mx-auto">
                    {call.error}
                </Alert>
            )}
            {call.notice && !call.error && (
                <Alert type="warning" showIcon className="mt-4 max-w-md mx-auto">
                    {call.notice}
                </Alert>
            )}
        </div>
    )
}

export default LiveAvatarCall
