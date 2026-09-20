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
        nextUrl.pathname.startsWith('/api/cron/')
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

    /** Uncomment this and `import { protectedRoutes } from '@/configs/routes.config'` if you want to enable role based access */
    // if (isSignedIn && nextUrl.pathname !== '/access-denied' && !nextUrl.pathname.startsWith(appConfig.apiPrefix)) {
    //     const routeMeta = protectedRoutes[nextUrl.pathname]
    //     const existingRoute = routeMeta
    //     const includedRole = routeMeta?.authority.some((role) => req.auth?.user?.authority.includes(role))
    //     if (existingRoute && !includedRole) {
    //         return Response.redirect(
    //             new URL('/access-denied', nextUrl),
    //         )
    //     }
    // }
})

export const config = {
    /**
     * Node.js y no Edge. Dos motivos, y el segundo es el que obliga:
     *
     * 1. Vercel ya no recomienda el runtime Edge: el middleware corre sobre
     *    Vercel Functions igual, con Node.js completo y el mismo precio.
     * 2. Vercel Services —que es como se despliega el limpiador de marcas de
     *    IA junto a esta app— NO admite salidas de función Edge. Con Edge el
     *    despliegue falla entero: "Edge Runtime is not supported in services"
     *    (medido el 2026-09-20 en el preview de feat/ai-mark-cleaner).
     *
     * Estable desde Next.js 15.5 (aquí 15.5.9); en 16 pasa a ser el valor por
     * defecto. Este middleware sólo lee la sesión de NextAuth y redirige, así
     * que no depende de ninguna API exclusiva de Edge.
     */
    runtime: 'nodejs',
    matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api)(.*)'],
}
