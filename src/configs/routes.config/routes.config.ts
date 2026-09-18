import dashboardsRoute from './dashboardsRoute'
import conceptsRoute from './conceptsRoute'
import uiComponentsRoute from './uiComponentsRoute'
import authRoute from './authRoute'
import authDemoRoute from './authDemoRoute'
import guideRoute from './guideRoute'
// import othersRoute from './othersRoute'
import type { Routes } from '@/@types/routes'

export const protectedRoutes: Routes = {
    ...dashboardsRoute,
    ...uiComponentsRoute,
    ...authDemoRoute,
    ...conceptsRoute,
    ...guideRoute,
}

export const publicRoutes: Routes = {
    /**
     * Aceptar una invitación a una organización (F4.3). Va en publicRoutes y
     * NO en authRoute a propósito: el middleware REBOTA al dashboard a quien
     * entra en una authRoute con sesión abierta (middleware.ts), y aquí el que
     * llega con sesión ajena necesita leer "cierra sesión para aceptar con
     * otra cuenta", no aparecer en el dashboard sin saber qué pasó con el
     * enlace que le mandaron. Una ruta pública pasa con y sin sesión.
     */
    '/accept-invite': {
        key: 'acceptInvite',
        authority: [],
    },
    /**
     * Cuenta con sesión pero sin organización (miembro expulsado que vuelve a
     * entrar). La guarda de (protected-pages)/layout.tsx redirige aquí; pública
     * por el mismo motivo que accept-invite: ni bucle con el middleware ni
     * con la propia guarda.
     */
    '/no-organization': {
        key: 'noOrganization',
        authority: [],
    },
}

export const authRoutes = authRoute
