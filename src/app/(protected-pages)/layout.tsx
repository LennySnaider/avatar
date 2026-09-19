import React from 'react'
import { redirect } from 'next/navigation'
import PostLoginLayout from '@/components/layouts/PostLoginLayout'
import { auth } from '@/auth'
import { tryGetOrgContext } from '@/lib/tenant/getOrgContext'
import { hasModuleForOrg } from '@/lib/modules/entitlements'
import StrategistWidget from '@/components/shared/StrategistWidget/StrategistWidget'
import AttentionWatcher from '@/components/shared/AttentionWatcher/AttentionWatcher'
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

    // F4.3 — Sesión válida pero SIN organización: es el expulsado que vuelve a
    // entrar con su contraseña (o una cuenta huérfana). Antes, la primera
    // página que llamara a getOrgContext() LANZABA y la persona veía una
    // pantalla de error en vez de un mensaje. Va a una página PÚBLICA a
    // propósito: mandarla a /sign-in con sesión abierta haría bucle con el
    // middleware (que rebota al dashboard a quien entra en una authRoute con
    // sesión), y una página protegida pasaría por esta misma guarda.
    //
    // Coste: una lectura indexada de organization_members por navegación,
    // la misma que getNavigation ya hace en el layout raíz.
    const ctx = await tryGetOrgContext()
    if (!ctx) {
        redirect('/no-organization')
    }

    // F5.2 (Estratega) — El widget flotante se monta AQUÍ, una sola vez, para
    // que la conversación sobreviva a la navegación (ver la cabecera de
    // `StrategistWidget.tsx`). Se reusa el `ctx` de arriba en vez de volver a
    // llamar a `tryGetOrgContext()`: es la misma lectura de
    // `organization_members`, y hacerla dos veces por navegación no compra
    // nada.
    //
    // Con el módulo sin instalar el widget devuelve `null` — ni botón, ni
    // llamadas al servicio. La comprobación vive en el SERVIDOR a propósito:
    // el cliente no puede decidir si tiene derecho a un módulo.
    //
    // Sin guardar: un hipo de `org_modules` (Supabase) tumbaba TODAS las
    // rutas protegidas, porque este layout envuelve cada una de ellas. Mismo
    // patrón que `getOrgUiContext` (`src/server/actions/navigation/getNavigation.ts`):
    // catch + log y degradar a "módulo no instalado", nunca dejar caer la
    // página entera por un fallo leyendo entitlements.
    let strategistInstalled = false
    try {
        strategistInstalled = await hasModuleForOrg(
            ctx.organizationId,
            'strategist',
        )
    } catch (error) {
        console.error('[layout] hasModuleForOrg strategist:', {
            organizationId: ctx.organizationId,
            error,
        })
        strategistInstalled = false
    }

    return (
        <PostLoginLayout>
            {children}
            <StrategistWidget installed={strategistInstalled} />
            {/* Aviso global (toast + sonido) de hilos escalados a humano.
                Mismo motivo para montarlo AQUÍ que el widget de arriba: una
                sola instancia que sobrevive a la navegación. Ver la cabecera
                de `AttentionWatcher.tsx`. */}
            <AttentionWatcher />
        </PostLoginLayout>
    )
}

export default Layout
