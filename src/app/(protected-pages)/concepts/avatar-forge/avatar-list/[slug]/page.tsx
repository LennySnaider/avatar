import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Alert from '@/components/ui/Alert'
import Container from '@/components/shared/Container'
import { getAvatarEarningsDashboard } from '@/services/EarningsService'
import { isEarningsPreset } from '@/lib/earnings/period'
import { DEFAULT_PRESET, ROUTES } from '@/components/view/earnings/constants'
import AvatarDashboardView from './_components/AvatarDashboardView'

interface PageProps {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

/**
 * Dashboard de ingresos de UN avatar (hub del avatar): se llega desde la
 * tarjeta de "My Avatars" y desde el ranking de Inicio. No cuelga del layout
 * gate de Telegram a propósito: un avatar sólo con Fanvue tiene que abrir.
 *
 * `not_found` (avatar inexistente o de otra organización: orgTable los deja
 * iguales) redirige a la lista, mismo criterio que telegram/[slug].
 */
export default async function Page({ params, searchParams }: PageProps) {
    const session = await auth()
    if (!session?.user?.id) redirect('/sign-in')

    const [{ slug: avatarId }, query] = await Promise.all([
        params,
        searchParams,
    ])
    const raw = Array.isArray(query.period) ? query.period[0] : query.period
    const preset = isEarningsPreset(raw) ? raw : DEFAULT_PRESET

    const result = await getAvatarEarningsDashboard(avatarId, preset)
    if (!result.success && result.error === 'not_found')
        redirect(ROUTES.avatarList)
    if (!result.success || !result.data) {
        return (
            <Container className="py-6">
                <h3 className="mb-6">Dashboard del avatar</h3>
                <Alert type="warning" showIcon>
                    No se pudieron cargar los ingresos de este avatar. El resto
                    de la app no se ve afectada.
                    {result.error ? ` (${result.error})` : ''}
                </Alert>
            </Container>
        )
    }

    return (
        <Container className="py-6">
            <AvatarDashboardView data={result.data} />
        </Container>
    )
}
