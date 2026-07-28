'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Guard de "tienes cambios sin guardar".
 *
 * Nace del Body Lab: sus hojas de cuerpo las COBRA KIE al generarlas y viven
 * solo en memoria hasta que el usuario guarda. Cerrar un drawer o irse por el
 * sidebar las tiraba en silencio.
 *
 * El hook no pinta nada — mantiene la intención de salida pendiente y expone
 * con qué envolver cada camino de salida. El diálogo lo pone el host (ver
 * `UnsavedChangesDialog`).
 */

export type PendingExit =
    | { kind: 'close' }
    | { kind: 'navigate'; href: string }

export interface UnsavedChangesGuardOptions {
    /** ¿Hay trabajo sin guardar ahora mismo? */
    isDirty: boolean
    /**
     * Intercepta los clicks en `<a>` internos a nivel documento. SOLO para
     * páginas: App Router no tiene `router.events` y `beforeunload` no ve las
     * transiciones de cliente, así que es la única forma de cubrir el sidebar
     * sin tocar los componentes de navegación. En un drawer no hace falta —su
     * backdrop ya tapa el sidebar— y tener dos interceptores a la vez sería
     * pedir problemas.
     */
    interceptLinks?: boolean
    /** Aviso nativo del navegador en F5 / cerrar pestaña. Default: true. */
    warnOnUnload?: boolean
    /** Escape hatch por si algún `<a>` concreto debe pasar sin preguntar. */
    shouldIgnoreLink?: (anchor: HTMLAnchorElement, e: MouseEvent) => boolean
}

export interface UnsavedChangesGuard {
    /** Intención de salida retenida. Truthy = hay que mostrar el diálogo. */
    pending: PendingExit | null
    /** Envuelve una acción de salida (cerrar, navegar…) para que pase por aquí. */
    guard: <A extends unknown[]>(
        action: (...args: A) => void,
    ) => (...args: A) => void
    /** "Descartar": ejecuta la salida retenida. */
    proceed: () => void
    /** "Seguir editando": olvida la salida retenida. */
    dismiss: () => void
    /** Ejecuta la salida retenida saltándose el guard (para "Guardar y salir"). */
    proceedIgnoringDirty: () => void
    /** Desarma el guard durante un macrotask (salidas deliberadas tras guardar). */
    bypassOnce: () => void
}

export default function useUnsavedChangesGuard({
    isDirty,
    interceptLinks = false,
    warnOnUnload = true,
    shouldIgnoreLink,
}: UnsavedChangesGuardOptions): UnsavedChangesGuard {
    const router = useRouter()
    const [pending, setPending] = useState<PendingExit | null>(null)

    // La acción retenida va en un REF, no en el estado: `setState(fn)` trata a
    // una función suelta como updater y ejecutaría el thunk en vez de guardarlo.
    const pendingRunRef = useRef<(() => void) | null>(null)
    // `isDirty` espejado en un ref para que el listener del documento se
    // registre UNA vez y no se re-enganche en cada tecla que teclea el usuario.
    const isDirtyRef = useRef(isDirty)
    const bypassRef = useRef(false)
    const ignoreLinkRef = useRef(shouldIgnoreLink)

    useEffect(() => {
        isDirtyRef.current = isDirty
    }, [isDirty])

    useEffect(() => {
        ignoreLinkRef.current = shouldIgnoreLink
    }, [shouldIgnoreLink])

    const bypassOnce = useCallback(() => {
        // Un `setIsDirty(false)` seguido de salir en el mismo tick no alcanza a
        // propagarse al ref, así que sin esto el guard preguntaría JUSTO
        // después de guardar con éxito.
        bypassRef.current = true
        setTimeout(() => {
            bypassRef.current = false
        }, 0)
    }, [])

    const runPending = useCallback(() => {
        const run = pendingRunRef.current
        pendingRunRef.current = null
        setPending(null)
        run?.()
    }, [])

    const dismiss = useCallback(() => {
        pendingRunRef.current = null
        setPending(null)
    }, [])

    const proceedIgnoringDirty = useCallback(() => {
        bypassOnce()
        runPending()
    }, [bypassOnce, runPending])

    const guard = useCallback(
        <A extends unknown[]>(action: (...args: A) => void) =>
            (...args: A) => {
                if (!isDirtyRef.current || bypassRef.current) {
                    action(...args)
                    return
                }
                pendingRunRef.current = () => action(...args)
                setPending({ kind: 'close' })
            },
        [],
    )

    // F5 / cerrar pestaña. El texto lo decide el navegador; la copia buena vive
    // en el diálogo, que cubre todas las salidas DENTRO de la app.
    useEffect(() => {
        if (!isDirty || !warnOnUnload) return
        const avisar = (e: BeforeUnloadEvent) => {
            e.preventDefault()
            e.returnValue = ''
        }
        window.addEventListener('beforeunload', avisar)
        return () => window.removeEventListener('beforeunload', avisar)
    }, [isDirty, warnOnUnload])

    useEffect(() => {
        if (!interceptLinks) return
        const onClick = (e: MouseEvent) => {
            if (!isDirtyRef.current || bypassRef.current) return
            if (e.defaultPrevented) return
            // Click con modificador o que no sea el principal = pestaña nueva,
            // ventana nueva o descarga: no se va de la página, no se retiene.
            if (
                e.button !== 0 ||
                e.metaKey ||
                e.ctrlKey ||
                e.shiftKey ||
                e.altKey
            ) {
                return
            }
            if (!(e.target instanceof Element)) return
            const anchor = e.target.closest('a[href]')
            if (!(anchor instanceof HTMLAnchorElement)) return
            if (anchor.target && anchor.target !== '_self') return
            if (anchor.hasAttribute('download')) return

            let url: URL
            try {
                url = new URL(anchor.href, window.location.href)
            } catch {
                return
            }
            if (url.origin !== window.location.origin) return
            // Mismo destino o solo hash (los `href="#"` que se usan de botón):
            // no se abandona la página, no hay nada que proteger.
            const aqui = window.location.pathname + window.location.search
            if (url.pathname + url.search === aqui) return
            if (ignoreLinkRef.current?.(anchor, e)) return

            // Los TRES: en fase de captura, `preventDefault` por sí solo no
            // impide que corra el onClick de `next/link` y navegue igual.
            e.preventDefault()
            e.stopPropagation()
            e.stopImmediatePropagation()

            const href = url.pathname + url.search + url.hash
            pendingRunRef.current = () => router.push(href)
            setPending({ kind: 'navigate', href })
        }
        document.addEventListener('click', onClick, true)
        return () => document.removeEventListener('click', onClick, true)
    }, [interceptLinks, router])

    return {
        pending,
        guard,
        proceed: runPending,
        dismiss,
        proceedIgnoringDirty,
        bypassOnce,
    }
}
