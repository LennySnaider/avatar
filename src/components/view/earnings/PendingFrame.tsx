'use client'

import { createContext, useContext, useTransition } from 'react'
import type { ReactNode, TransitionStartFunction } from 'react'
import classNames from '@/utils/classNames'

/**
 * Un cambio de período (`?period=`) o un "Actualizar" vuelven a renderizar la
 * página en el servidor. Next mantiene el árbol actual mientras tanto (no
 * vuelve a mostrar `loading.tsx`), así que sin esto el usuario no vería nada
 * hasta que llegase la respuesta. El marco atenúa el cuerpo y bloquea clics
 * mientras hay una transición en curso; los controles que la disparan
 * comparten la misma transición vía contexto.
 */
interface PendingContextValue {
    isPending: boolean
    startTransition: TransitionStartFunction
}

const PendingContext = createContext<PendingContextValue | null>(null)

export function usePendingTransition(): PendingContextValue {
    const ctx = useContext(PendingContext)
    if (ctx) return ctx
    // Fuera del provider (p.ej. en tests o usos sueltos) no hay transición
    // compartida: se ejecuta en el acto.
    return { isPending: false, startTransition: (fn) => fn() }
}

export function PendingProvider({ children }: { children: ReactNode }) {
    const [isPending, startTransition] = useTransition()
    return (
        <PendingContext.Provider value={{ isPending, startTransition }}>
            {children}
        </PendingContext.Provider>
    )
}

export function PendingFrame({
    children,
    className,
}: {
    children: ReactNode
    className?: string
}) {
    const { isPending } = usePendingTransition()
    return (
        <div
            aria-busy={isPending}
            className={classNames(
                'transition-opacity duration-200',
                isPending && 'opacity-60 pointer-events-none',
                className,
            )}
        >
            {children}
        </div>
    )
}
