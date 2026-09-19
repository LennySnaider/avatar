'use client'

import { useEffect, useRef, useState } from 'react'
import { HiOutlineExternalLink } from 'react-icons/hi'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import Input from '@/components/ui/Input'
import Notification from '@/components/ui/Notification'
import Tag from '@/components/ui/Tag'
import toast from '@/components/ui/toast'
import { TOKEN_USD } from '@/lib/billing/catalog'
import {
    getStrategistStatus,
    startMetaConsent,
    updateStrategistSettings,
    type StrategistStatus,
} from '@/services/AssistantService'

/**
 * F5.2 (Estratega) Task 6 — Ajustes del módulo `strategist` desde la tarjeta
 * de Módulos: topes de tokens, estado de Meta y consumo de hoy.
 *
 * `getStrategistStatus()` se llama UNA VEZ POR APERTURA del panel, no por
 * render ni por tecla: acuña un reto de consentimiento contra Vercel Connect
 * (ver la cabecera de `AssistantService.ts`), así que un pestillo
 * (`pedidoRef`) evita que el doble montaje de React en desarrollo lo dispare
 * dos veces — el mismo patrón que `StrategistWidget`.
 */
function notify(type: 'success' | 'danger', title: string, message?: string) {
    toast.push(
        <Notification type={type} title={title}>
            {message}
        </Notification>,
    )
}

/** Entero positivo válido para un tope de tokens, o `null` si no lo es. */
function parseTope(valor: string): number | null {
    const n = Number(valor)
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null
    return n
}

/**
 * Los topes se guardan en TOKENS DE SALDO (los del monedero de la
 * organización, que es lo que el turno aparta y cobra — ver la cabecera de
 * `@/lib/assistant/budget`). Aquí se traduce a USD a precio de cliente
 * (`tokens × TOKEN_USD`) porque "200 tokens" no le dice a nadie cuánto
 * dinero está autorizando y "0,20 $" sí.
 *
 * Dos decimales cuando el importe es visible en céntimos y cuatro cuando no:
 * con topes pequeños, `toFixed(2)` pintaría "$0.00" y parecería gratis.
 */
function equivalenteUsd(tokens: number): string {
    const usd = tokens * TOKEN_USD
    return usd >= 0.01 ? usd.toFixed(2) : usd.toFixed(4)
}

/** Texto de ayuda bajo un campo de tope. `null` si lo escrito no es un tope. */
function ayudaTope(valor: string, sufijo: string): string | null {
    const n = parseTope(valor)
    if (n === null) return null
    return `≈ $${equivalenteUsd(n)} ${sufijo}`
}

export default function StrategistSettingsDrawer({
    isOpen,
    onClose,
}: {
    isOpen: boolean
    onClose: () => void
}) {
    const [status, setStatus] = useState<StrategistStatus | null>(null)
    const [cargando, setCargando] = useState(false)
    const [guardando, setGuardando] = useState(false)
    const [conectando, setConectando] = useState(false)
    const [dailyTokenCap, setDailyTokenCap] = useState('')
    const [perTurnTokenCap, setPerTurnTokenCap] = useState('')
    const [metaConnected, setMetaConnected] = useState(false)
    const [consentUrl, setConsentUrl] = useState<string | null>(null)

    const vivoRef = useRef(true)
    const pedidoRef = useRef(false)

    useEffect(() => {
        vivoRef.current = true
        return () => {
            vivoRef.current = false
        }
    }, [])

    useEffect(() => {
        if (!isOpen) {
            pedidoRef.current = false
            return
        }
        if (pedidoRef.current) return
        pedidoRef.current = true
        setCargando(true)
        void (async () => {
            try {
                const res = await getStrategistStatus()
                if (!vivoRef.current) return
                if (!res.success || !res.data) {
                    notify(
                        'danger',
                        'No se pudo leer el estado del Estratega',
                        res.error,
                    )
                    return
                }
                setStatus(res.data)
                setDailyTokenCap(String(res.data.settings.dailyTokenCap))
                setPerTurnTokenCap(String(res.data.settings.perTurnTokenCap))
                setMetaConnected(res.data.meta.connected)
                setConsentUrl(res.data.meta.consentUrl ?? null)
            } catch (e) {
                console.error('[modules] StrategistSettingsDrawer estado:', e)
                if (!vivoRef.current) return
                notify(
                    'danger',
                    'No se pudo leer el estado del Estratega',
                    'Inténtalo de nuevo en unos segundos.',
                )
            } finally {
                if (vivoRef.current) setCargando(false)
            }
        })()
    }, [isOpen])

    const handleGuardar = async () => {
        const daily = parseTope(dailyTokenCap)
        const perTurn = parseTope(perTurnTokenCap)
        if (daily === null) {
            notify(
                'danger',
                'Tope diario inválido',
                'Debe ser un número entero mayor que cero.',
            )
            return
        }
        if (perTurn === null) {
            notify(
                'danger',
                'Tope por turno inválido',
                'Debe ser un número entero mayor que cero.',
            )
            return
        }
        if (perTurn > daily) {
            notify(
                'danger',
                'El tope por turno no puede superar el tope diario.',
            )
            return
        }
        setGuardando(true)
        try {
            const res = await updateStrategistSettings({
                dailyTokenCap: daily,
                perTurnTokenCap: perTurn,
            })
            if (!vivoRef.current) return
            if (!res.success || !res.data) {
                notify('danger', 'No se pudieron guardar los ajustes', res.error)
                return
            }
            setStatus((prev) =>
                prev ? { ...prev, settings: res.data! } : prev,
            )
            setDailyTokenCap(String(res.data.dailyTokenCap))
            setPerTurnTokenCap(String(res.data.perTurnTokenCap))
            notify('success', 'Ajustes guardados')
        } catch (e) {
            console.error('[modules] StrategistSettingsDrawer guardar:', e)
            if (!vivoRef.current) return
            notify(
                'danger',
                'No se pudieron guardar los ajustes',
                'Inténtalo de nuevo en unos segundos.',
            )
        } finally {
            if (vivoRef.current) setGuardando(false)
        }
    }

    const handleConectarMeta = async () => {
        if (consentUrl) {
            window.open(consentUrl, '_blank', 'noopener,noreferrer')
            return
        }
        setConectando(true)
        try {
            const res = await startMetaConsent()
            if (!vivoRef.current) return
            if (!res.success || !res.data) {
                notify('danger', 'No se pudo conectar Meta', res.error)
                return
            }
            if (res.data.connected) {
                setMetaConnected(true)
                setConsentUrl(null)
                notify('success', 'Meta ya está conectado')
                return
            }
            setConsentUrl(res.data.url)
            window.open(res.data.url, '_blank', 'noopener,noreferrer')
        } catch (e) {
            console.error('[modules] StrategistSettingsDrawer conectar meta:', e)
            if (!vivoRef.current) return
            notify(
                'danger',
                'No se pudo conectar Meta',
                'Inténtalo de nuevo en unos segundos.',
            )
        } finally {
            if (vivoRef.current) setConectando(false)
        }
    }

    const usado = status?.usageToday.tokens ?? 0
    const costo = status?.usageToday.costUsd ?? 0

    return (
        <Drawer
            isOpen={isOpen}
            placement="right"
            width={400}
            title="Ajustes del Estratega"
            onClose={onClose}
            onRequestClose={onClose}
        >
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                    <h6>Topes de tokens de saldo</h6>
                    <p className="text-xs text-gray-500">
                        Son tokens del saldo de la organización (lo que cada
                        turno aparta y cobra), no tokens del modelo. Un turno
                        de lectura gasta ~12 y uno que consulta Meta Ads ~129.
                    </p>
                    <div>
                        <label
                            htmlFor="strategist-daily-token-cap"
                            className="text-sm mb-1 block"
                        >
                            Tope diario (tokens de saldo)
                        </label>
                        <Input
                            id="strategist-daily-token-cap"
                            type="number"
                            min={1}
                            step={1}
                            value={dailyTokenCap}
                            disabled={cargando || guardando}
                            onChange={(e) => setDailyTokenCap(e.target.value)}
                        />
                        <span className="text-xs text-gray-500 mt-1 block">
                            {ayudaTope(dailyTokenCap, 'al día') ??
                                'Escribe un número entero mayor que cero.'}
                        </span>
                    </div>
                    <div>
                        <label
                            htmlFor="strategist-per-turn-token-cap"
                            className="text-sm mb-1 block"
                        >
                            Tope por turno (tokens de saldo)
                        </label>
                        <Input
                            id="strategist-per-turn-token-cap"
                            type="number"
                            min={1}
                            step={1}
                            value={perTurnTokenCap}
                            disabled={cargando || guardando}
                            onChange={(e) => setPerTurnTokenCap(e.target.value)}
                        />
                        <span className="text-xs text-gray-500 mt-1 block">
                            {ayudaTope(perTurnTokenCap, 'por turno') ??
                                'Escribe un número entero mayor que cero.'}
                        </span>
                    </div>
                    <Button
                        variant="solid"
                        loading={guardando}
                        disabled={cargando}
                        onClick={() => void handleGuardar()}
                    >
                        Guardar
                    </Button>
                </div>

                <div className="flex flex-col gap-2">
                    <h6>Meta Ads</h6>
                    <div className="flex items-center gap-2">
                        {metaConnected ? (
                            <Tag className="bg-emerald-100 text-emerald-700">
                                Meta conectado
                            </Tag>
                        ) : (
                            <Tag className="bg-amber-100 text-amber-700">
                                Meta sin conectar
                            </Tag>
                        )}
                    </div>
                    {!metaConnected && (
                        <Button
                            size="sm"
                            variant="solid"
                            icon={<HiOutlineExternalLink />}
                            loading={conectando}
                            disabled={cargando}
                            onClick={() => void handleConectarMeta()}
                        >
                            Conectar Meta
                        </Button>
                    )}
                </div>

                <div className="flex flex-col gap-1">
                    <h6>Uso de hoy</h6>
                    {cargando ? (
                        <span className="text-sm text-gray-400">Cargando…</span>
                    ) : (
                        <span className="text-sm">
                            {/* Cuatro decimales: el coste de un día de uso
                                normal está en céntimos de céntimo, y
                                `toFixed(2)` pintaba "$0.00" siempre. */}
                            {usado.toLocaleString()} tokens de saldo · $
                            {costo.toFixed(4)} de coste
                        </span>
                    )}
                </div>
            </div>
        </Drawer>
    )
}
