'use client'

/**
 * EL BANNER DEL «VER COMO» — lo que impide olvidarse de dónde se está.
 *
 * Un admin de plataforma dentro de un tenant ve EXACTAMENTE el producto del
 * cliente: los mismos avatares, el mismo inbox, el mismo monedero. Sin una
 * marca permanente, confundir esa cuenta con la propia es cuestión de minutos,
 * y el error no es cosmético — se generan imágenes con el saldo ajeno y se
 * contesta a fans que no son tuyos.
 *
 * TRES ESTADOS Y TRES COLORES, porque significan cosas distintas:
 *   ámbar  — sólo lectura. Estás mirando; no puedes tocar nada.
 *   rojo   — el tenant te abrió la puerta. Puedes escribir y gastar SU saldo.
 *   morado — rompiste el cristal. Puedes escribir y NADIE te lo concedió.
 *
 * El morado existe separado del rojo a propósito. Es el único caso en el que
 * se opera una cuenta sin permiso de su dueño, y que se vea distinto es parte
 * de lo que lo hace defendible.
 *
 * Es `fixed` abajo y no arriba: la cabecera del producto ya está ocupada y un
 * banner que empuja el layout rompe las pantallas que miden alto (el Inbox y
 * el Studio). Abajo tapa poco y se ve siempre.
 */

import { useState, useTransition } from 'react'
import Button from '@/components/ui/Button'
import { leaveOrg } from '@/services/PlatformService'
import type { SupportGrantKind } from '@/lib/platform/supportGrant'

interface ViewingAsBannerProps {
    orgName: string
    elevated: boolean
    kind: SupportGrantKind | null
}

const ViewingAsBanner = ({ orgName, elevated, kind }: ViewingAsBannerProps) => {
    const [pending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    const breakGlass = elevated && kind === 'break_glass'
    const tono = !elevated
        ? 'bg-amber-500 text-amber-950'
        : breakGlass
          ? 'bg-purple-700 text-white'
          : 'bg-red-600 text-white'

    const queDice = !elevated
        ? 'Sólo lectura'
        : breakGlass
          ? 'Cristal roto — sin permiso del tenant'
          : 'Puedes escribir y gastar su saldo'

    const salir = () => {
        setError(null)
        startTransition(async () => {
            const r = await leaveOrg()
            if (!r.success) {
                setError(r.error ?? 'No se pudo salir')
                return
            }
            // Recarga dura a propósito: al soltar la cookie cambia la
            // organización de TODO el árbol de servidor, y un refresh suave
            // dejaría datos del tenant en caché de cliente.
            window.location.href = '/platform'
        })
    }

    return (
        <div
            className={`fixed bottom-0 inset-x-0 z-[60] ${tono} shadow-lg`}
            role="status"
            aria-live="polite"
        >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                <span className="text-sm font-bold">Viendo como: {orgName}</span>
                <span className="text-xs opacity-90">{queDice}</span>
                {error && <span className="text-xs font-semibold">· {error}</span>}
                <span className="grow" />
                <Button size="xs" loading={pending} onClick={salir}>
                    Salir
                </Button>
            </div>
        </div>
    )
}

export default ViewingAsBanner
