import NoOrganizationClient from './_components/NoOrganizationClient'

/**
 * Cuenta con sesión válida pero sin organización.
 *
 * Es donde aterriza un miembro expulsado que vuelve a entrar con su
 * contraseña: su cuenta en `users` sobrevive (borrar una identidad porque una
 * organización la echó sería desproporcionado), pero ya no pertenece a ninguna
 * organización y, por decisión de producto, un usuario vive en UNA sola.
 *
 * PÚBLICA a propósito (`publicRoutes` en routes.config.ts): la guarda de
 * `(protected-pages)/layout.tsx` redirige aquí, y si esta página fuese
 * protegida pasaría por esa misma guarda. Y no es una authRoute porque el
 * middleware rebota al dashboard a quien entra en una con sesión abierta.
 */
export default function NoOrganizationPage() {
    return <NoOrganizationClient />
}
