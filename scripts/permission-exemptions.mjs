/**
 * EXENCIONES DEL CANDADO DE ROL (`local/no-unguarded-org-action`).
 *
 * La regla exige que toda función que resuelva `OrgContext` compruebe el rol.
 * Aquí viven los sitios donde esa exigencia es CONCEPTUALMENTE INVÁLIDA, no
 * donde es incómoda: código que corre SIN SESIÓN (webhook, cron, callback de
 * OAuth) no tiene rol que comprobar, porque no hay persona detrás.
 *
 * La lista vive en un fichero propio, no dentro de `eslint.config.mjs`, para
 * que sea UNA sola fuente: el día que el centinela de `check-tenant-access.mjs`
 * quiera el mismo conjunto, lo importa de aquí en vez de copiarlo a mano. (Las
 * dos listas que ya existen están duplicadas entre ese script y la config de
 * ESLint, con las divergencias justificadas en prosa — no repitamos el patrón.)
 *
 * FORMA: pares `[prefijo, motivo]`. Prefijo acabado en `/` = carpeta entera;
 * sin `/` = fichero exacto. El motivo se escribe al lado, siempre: una
 * exención sin motivo es un agujero que nadie se atreve a quitar después.
 *
 * REGLA DE ORO: si el motivo que se te ocurre es "aquí el guard no hace falta
 * porque sólo lee", NO es una exención — es un `content:read`.
 */
export const PERMISSION_EXEMPTIONS = [
    [
        'src/lib/tenant/getOrgContext.ts',
        'Es quien CONSTRUYE el ctx: pedirle que compruebe el rol que todavía no ha leído es la dependencia circular.',
    ],
    [
        'src/app/api/auth/',
        'Alta de cuenta y recuperación: el usuario aún no tiene organización ni rol. sign-up CREA la membresía, así que no puede exigirla.',
    ],
    [
        'src/lib/auth/',
        'Provisión de usuarios de OAuth: corre dentro del callback de NextAuth, antes de que exista membresía.',
    ],
    [
        'src/app/api/webhooks/',
        'Sin sesión: la organización se resuelve DESDE EL DATO (la fila del bot, de la cuenta social). No hay persona, así que no hay rol.',
    ],
    [
        'src/app/api/cron/',
        'Sin sesión: lo dispara el planificador de Vercel con CRON_SECRET.',
    ],
    [
        'src/lib/fanvue/tokenStore.ts',
        'Lo llaman el callback de OAuth y el webhook de Fanvue: resuelve la org desde la conexión guardada, no desde una sesión.',
    ],
    [
        'src/lib/agent/inboxSync.ts',
        'Sincronización disparada por cron y por webhook del proveedor.',
    ],
    [
        'src/server/actions/navigation/getNavigation.ts',
        'Decide qué ítems PINTA el menú, y el layout raíz lo ejecuta también sin sesión. Esconder un ítem no autoriza nada: el gate real está en el layout de la rama y en cada action.',
    ],
]

export default PERMISSION_EXEMPTIONS
