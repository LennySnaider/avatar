import NextAuth from 'next-auth'

import authConfig from '@/configs/auth.config'
import {
    authRoutes as _authRoutes,
    publicRoutes as _publicRoutes,
    // protectedRoutes
} from '@/configs/routes.config'
import { REDIRECT_URL_KEY } from '@/constants/app.constant'
import appConfig from '@/configs/app.config'

const { auth } = NextAuth(authConfig)

const publicRoutes = Object.entries(_publicRoutes).map(([key]) => key)
const authRoutes = Object.entries(_authRoutes).map(([key]) => key)

const apiAuthPrefix = `${appConfig.apiPrefix}/auth`

export default auth((req) => {
    const { nextUrl } = req
    const isSignedIn = !!req.auth

    const isApiAuthRoute = nextUrl.pathname.startsWith(apiAuthPrefix)
    const isPublicRoute = publicRoutes.includes(nextUrl.pathname)
    const isAuthRoute = authRoutes.includes(nextUrl.pathname)

    /** Skip auth middleware for api routes */
    if (isApiAuthRoute) return

    /**
     * Server-to-server endpoints that carry their own auth and can never
     * have a NextAuth session cookie: provider webhooks (Upload-Post posts
     * events here) and Vercel cron (gated by CRON_SECRET Bearer inside the
     * handler). A session redirect here silently breaks both — the provider
     * gets a 302 instead of the handler.
     */
    if (
        nextUrl.pathname.startsWith('/api/webhooks/') ||
        nextUrl.pathname.startsWith('/api/cron/') ||
        // Módulo live_avatar: el visitante del link público es anónimo y
        // cada turno se autentica con el secreto de SU sesión
        // (`live_sessions.secret_hash`), no con cookie.
        nextUrl.pathname.startsWith('/api/live/') ||
        // …y su página pública `/live/<token>` (también la carga el iframe
        // del widget en webs ajenas). `publicRoutes` es comparación exacta y
        // no sirve para un segmento dinámico.
        nextUrl.pathname.startsWith('/live/')
    ) {
        return
    }

    if (isAuthRoute) {
        if (isSignedIn) {
            /** Redirect to authenticated entry path if signed in & path is auth route */
            return Response.redirect(
                new URL(appConfig.authenticatedEntryPath, nextUrl),
            )
        }
        return
    }

    /** Redirect to authenticated entry path if signed in & path is public route */
    if (!isSignedIn && !isPublicRoute) {
        let callbackUrl = nextUrl.pathname
        if (nextUrl.search) {
            callbackUrl += nextUrl.search
        }

        return Response.redirect(
            new URL(
                `${appConfig.unAuthenticatedEntryPath}?${REDIRECT_URL_KEY}=${callbackUrl}`,
                nextUrl,
            ),
        )
    }

    // AQUÍ VENÍA el bloque de "role based access" comentado de la plantilla
    // ECME, invitando a descomentarlo. Se retira en la F4.4 porque proponía un
    // control de acceso que este producto NO usa y que no funcionaría:
    //
    //  1. Leía `req.auth.user.authority`, que es el eje muerto de la plantilla
    //     (todo usuario nace con `['user']` y todas las rutas piden
    //     `[ADMIN, USER]`, así que no filtraba nada).
    //  2. El control real vive en otro sitio y con otro eje: el rol de
    //     `organization_members` → `getOrgContext()` → los ~121
    //     `requirePermission` de los servicios, más `requirePlatformAdmin()`
    //     para el panel de plataforma.
    //  3. Este middleware corre en EDGE y no puede consultar la base, así que
    //     nunca podría evaluar ninguno de los dos.
    //
    // Dejarlo comentado era peor que no tenerlo: el día que alguien lo
    // descomente creyendo que activa permisos, habrá añadido una comprobación
    // que siempre pasa y la sensación de tener un candado donde no hay ninguno.
})

export const config = {
    matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api)(.*)'],
}
