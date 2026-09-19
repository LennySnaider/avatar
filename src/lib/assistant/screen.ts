/**
 * F5.2 (Estratega) Task 5 — De DÓNDE ESTÁ MIRANDO el usuario a la
 * `AssistantScreen` que viaja en el cuerpo del turno.
 *
 * La pantalla no es decorativa: recorta el catálogo de herramientas que se le
 * enseña al modelo (ver `src/lib/assistant/types.ts`) y matiza el prompt de
 * sistema. Como el widget es GLOBAL —un único FAB montado en el layout
 * protegido, no una pieza por página—, la única señal barata de "dónde está"
 * es la ruta.
 *
 * PURO A PROPÓSITO: ni `next/navigation` ni React. Así `screen.test.ts` lo
 * prueba con `tsx --test` y la función se puede llamar desde cualquier sitio
 * (el widget, un botón contextual, un test) sin arrastrar el router.
 *
 * EL ORDEN DE LAS REGLAS IMPORTA: se comprueban de la más específica a la más
 * general y gana la primera. `/social/accounts` y `/social/posts` comparten
 * prefijo, así que una regla `/social` genérica colocada arriba se las
 * comería a las dos.
 *
 * SE COMPARA POR SUFIJO/SUBCADENA Y NO POR IGUALDAD porque las rutas reales
 * llevan prefijo de grupo (`/concepts/avatar-forge/...`) y a veces cola
 * (`/social/accounts/algo`). Igualar la ruta entera obligaría a tocar este
 * fichero cada vez que el árbol de rutas se mueva un nivel.
 */
import type { AssistantScreen } from './types'

/** Regla: si la ruta contiene `needle`, la pantalla es `screen`. */
const REGLAS: readonly { needle: string; screen: AssistantScreen }[] = [
    { needle: '/social/accounts', screen: 'social-accounts' },
    { needle: '/social/posts', screen: 'social-posts' },
    { needle: '/inbox', screen: 'inbox' },
    { needle: '/avatar-studio', screen: 'studio' },
    { needle: '/account/modules', screen: 'modules' },
]

/**
 * Normaliza la ruta antes de compararla: minúsculas, sin query ni hash (el
 * `usePathname` de Next no los trae, pero a esta función la puede llamar
 * cualquiera) y con una barra al final para que `/inbox` case también cuando
 * la ruta ES exactamente `/concepts/avatar-forge/inbox`.
 */
function normalizar(pathname: string): string {
    const sinCola = pathname.split('?')[0].split('#')[0].toLowerCase()
    return sinCola.endsWith('/') ? sinCola : `${sinCola}/`
}

/**
 * La pantalla del Estratega para una ruta. Lo que no reconoce es `'other'`,
 * nunca `undefined`: el servidor normaliza igual (ver `parseAssistantScreen`)
 * y así las dos mitades del contrato dicen lo mismo.
 */
export function screenFromPathname(
    pathname: string | null | undefined,
): AssistantScreen {
    if (typeof pathname !== 'string' || pathname.length === 0) return 'other'
    const ruta = normalizar(pathname)
    for (const regla of REGLAS) {
        // La barra final del needle evita que `/inbox` case con
        // `/inbox-legacy`: se compara segmento completo, no prefijo de palabra.
        if (ruta.includes(`${regla.needle}/`)) return regla.screen
    }
    return 'other'
}
