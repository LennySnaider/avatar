import type { ReactNode } from 'react'
import { getOrgContext } from '@/lib/tenant/getOrgContext'
import { hasModule } from '@/lib/modules/entitlements'
import ModuleNotInstalled from '@/components/shared/ModuleNotInstalled'

/**
 * Gate del módulo "telegram" para toda la rama `/concepts/avatar-forge/telegram`
 * (el índice y cada `[slug]`). Nunca un 404: la ruta existe, lo útil es
 * explicar cómo activarla — mismo criterio que ya documenta el nav item en
 * `concepts.navigation.config.ts` ("El gate real de acceso vive en el layout
 * de la ruta y en cada server action de AgentTelegramService.ts").
 *
 * `getOrgContext()` lanza por DOS motivos (sin sesión, sin fila en
 * `organization_members` — ver su docblock). El layout raíz
 * `(protected-pages)/layout.tsx` ya garantiza la sesión, así que lo único que
 * puede tirar aquí es la segunda. Mismo criterio defensivo que
 * `getAvatarAgentData` / `agent/page.tsx` / `fanvue/composer/page.tsx`: sin
 * organización resuelta no hay módulo que ofrecer, así que el catch cae en el
 * mismo aviso de "no instalado" en vez de un 500 genérico (no hay `error.tsx`
 * en `(protected-pages)`).
 */
export default async function TelegramModuleLayout({
    children,
}: {
    children: ReactNode
}) {
    try {
        const ctx = await getOrgContext()
        if (await hasModule(ctx, 'telegram')) {
            return <>{children}</>
        }
    } catch (e) {
        console.warn('[telegram/layout] sin contexto de organización', e)
    }
    return <ModuleNotInstalled slug="telegram" />
}
