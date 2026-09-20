import { useState, useEffect } from 'react'
import classNames from 'classnames'
import Arrow from './Arrow'
import type { CommonProps } from '../@types/common'
import type { ArrowPlacement } from './Arrow'
import type { ReactNode } from 'react'
import {
    useFloating,
    autoUpdate,
    offset,
    flip,
    shift,
    useHover,
    useFocus,
    useDismiss,
    useRole,
    useInteractions,
    FloatingPortal,
} from '@floating-ui/react'

export interface TooltipProps extends CommonProps {
    isOpen?: boolean
    placement?: ArrowPlacement
    title: string | ReactNode
    wrapperClass?: string
    disabled?: boolean
}

const Tooltip = (props: TooltipProps) => {
    const {
        className,
        children,
        isOpen = false,
        placement = 'top',
        title,
        wrapperClass,
        disabled,
    } = props

    const [tooltipOpen, setTooltipOpen] = useState<boolean>(isOpen)
    const [isAnimated, setIsAnimated] = useState(false)

    // Trigger animation when tooltip opens
    useEffect(() => {
        if (tooltipOpen) {
            const timer = setTimeout(() => setIsAnimated(true), 10)
            return () => clearTimeout(timer)
        } else {
            setIsAnimated(false)
        }
    }, [tooltipOpen])

    const tooltipColor = {
        background: 'bg-gray-800 dark:bg-black',
        arrow: 'text-gray-800 dark:text-black',
    }

    const defaultTooltipClass = `tooltip ${tooltipColor.background}`

    const { refs, floatingStyles, context } = useFloating({
        open: isOpen,
        onOpenChange: (open) => {
            if (!disabled) {
                setTooltipOpen(open)
            }
        },
        placement,
        whileElementsMounted: autoUpdate,
        middleware: [
            offset(7),
            flip({
                fallbackAxisSideDirection: 'start',
            }),
            shift(),
        ],
    })

    const hover = useHover(context, { move: false })
    const focus = useFocus(context)
    const dismiss = useDismiss(context)
    const role = useRole(context, { role: 'tooltip' })

    const { getReferenceProps, getFloatingProps } = useInteractions([
        hover,
        focus,
        dismiss,
        role,
    ])

    return (
        <>
            <span
                ref={refs.setReference}
                {...getReferenceProps()}
                className={classNames('tooltip-wrapper', wrapperClass)}
            >
                {children}
            </span>
            <FloatingPortal>
                {tooltipOpen && (
                    <div
                        ref={refs.setFloating}
                        className={classNames(
                            defaultTooltipClass,
                            className,
                        )}
                        style={{
                            ...floatingStyles,
                            opacity: isAnimated ? 1 : 0,
                            visibility: isAnimated ? 'visible' : 'hidden',
                            transition:
                                'opacity 0.15s ease-out, visibility 0.15s ease-out',
                            // El tooltip NO puede recibir el puntero. Vive en un
                            // portal, así que en cuanto el cursor lo pisa el
                            // `useHover` da por salido el elemento de
                            // referencia y lo cierra; al cerrarse, el cursor
                            // vuelve a estar sobre el botón y lo abre otra vez.
                            // Eso es el PARPADEO que se ve al mover el ratón
                            // por la zona donde asoma el tooltip, y pasa sobre
                            // todo cuando `flip` lo coloca del lado al que uno
                            // mueve la mano (el Delete del visor, pegado al
                            // borde, lo hacía siempre).
                            //
                            // Se puede poner en todos porque ningún tooltip de
                            // la app lleva contenido con el que se interactúe:
                            // todos son texto. El día que uno lo lleve,
                            // necesitará `safePolygon()` en el useHover en vez
                            // de esto.
                            pointerEvents: 'none',
                        }}
                        {...getFloatingProps()}
                    >
                        <span>{title}</span>
                        <Arrow
                            placement={context.placement}
                            color={tooltipColor.arrow}
                        />
                    </div>
                )}
            </FloatingPortal>
        </>
    )
}

Tooltip.displayName = 'Tooltip'

export default Tooltip
