import { Suspense } from 'react'
import AcceptInviteClient from './_components/AcceptInviteClient'

/**
 * `/accept-invite?token=…` — ruta ESTÁTICA con el token en la query, igual
 * que reset-password. No es `/invite/[token]` a propósito: el middleware casa
 * las rutas públicas por igualdad exacta de pathname (`publicRoutes` en
 * routes.config.ts), y un segmento dinámico no casaría nunca — el invitado
 * sin sesión acabaría en /sign-in con su token perdido en el redirectUrl.
 */
const Page = () => {
    return (
        <Suspense>
            <AcceptInviteClient />
        </Suspense>
    )
}

export default Page
