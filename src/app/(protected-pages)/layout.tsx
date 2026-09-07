import React from 'react'
import { redirect } from 'next/navigation'
import PostLoginLayout from '@/components/layouts/PostLoginLayout'
import { auth } from '@/auth'
import appConfig from '@/configs/app.config'
import { ReactNode } from 'react'

/**
 * Puerta de entrada REAL a todo lo autenticado.
 *
 * POR QUE EXISTE ESTE CHEQUEO, si ya hay middleware: el middleware corre en
 * EDGE y sólo puede verificar la FIRMA del JWT — no puede consultar la base.
 * Desde que existe la expulsión de sesiones (`users.password_changed_at`), un
 * token REVOCADO conserva su firma válida, así que el middleware lo deja pasar
 * tan contento. La sesión sólo muere cuando algo en runtime Node llama a
 * `auth()`, porque es ahí donde el callback `jwt` de `src/auth.ts` compara la
 * marca y devuelve null.
 *
 * Este layout es ese `auth()`, colocado en el único sitio por el que pasa TODA
 * página protegida. Cierra el hueco que quedaba: antes, con un token revocado,
 * los DATOS estaban a salvo (todo sale por `auth()` / `getOrgContext()`) pero
 * la NAVEGACIÓN no — se podía seguir paseando por la app viendo cascarones.
 *
 * NO conviertas `PostLoginLayout` en server component para lograr esto: es
 * cliente a propósito (tema, navegación, estado de la plantilla). El chequeo
 * vive en el server component que ya lo envolvía.
 *
 * COSTE: un `auth()` por navegación, no una lectura de base por request — la
 * comprobación de revocación está cacheada 30 s en memoria del proceso (ver
 * `src/lib/auth/sessionRevocation.ts`), y la mayoría de estas páginas ya
 * llamaban a `auth()` o a `getOrgContext()` de todos modos.
 *
 * SIN `redirectUrl` A PROPOSITO: el middleware ya lo pone para quien llega sin
 * sesión, que es el caso de "iba a una página y le pedimos entrar". Aquí el
 * caso es otro — a esta persona la acaban de EXPULSAR a mitad de sesión — y
 * devolverla después a la pantalla donde estaba no aporta nada; el destino
 * natural tras volver a entrar es su punto de entrada de siempre.
 */
const Layout = async ({ children }: { children: ReactNode }) => {
    const session = await auth()

    // `redirect()` funciona LANZANDO NEXT_REDIRECT: nunca lo metas dentro de un
    // try/catch que se trague la excepción, o la redirección se convierte en
    // una página en blanco.
    if (!session?.user?.id) {
        redirect(appConfig.unAuthenticatedEntryPath)
    }

    return <PostLoginLayout>{children}</PostLoginLayout>
}

export default Layout
