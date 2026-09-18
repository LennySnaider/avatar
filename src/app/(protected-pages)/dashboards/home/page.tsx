import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Alert from '@/components/ui/Alert'
import Container from '@/components/shared/Container'
import { getOrgEarningsDashboard } from '@/services/EarningsService'
import { isEarningsPreset } from '@/lib/earnings/period'
import { DEFAULT_PRESET } from '@/components/view/earnings/constants'
import HomeDashboardView from './_components/HomeDashboardView'

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

/**
 * Inicio: ingresos de toda la organización (Fanvue en USD, Telegram en Stars).
 * Destino tras el login (`authenticatedEntryPath`). El período viaja en la
 * URL (`?period=30d`); uno inválido cae al de por defecto en silencio.
 *
 * Quien autoriza es la server action (`getOrgEarningsDashboard`: sesión, org
 * y permiso `content:read`); la página sólo pinta. Un fallo del servicio se
 * muestra como aviso, nunca como 500.
 */
export default async function Page({ searchParams }: PageProps) {
    const session = await auth()
    if (!session?.user?.id) redirect('/sign-in')

    const params = await searchParams
    const raw = Array.isArray(params.period) ? params.period[0] : params.period
    const preset = isEarningsPreset(raw) ? raw : DEFAULT_PRESET

    const result = await getOrgEarningsDashboard(preset)
    if (!result.success || !result.data) {
        return (
            <Container className="py-6">
                <h3 className="mb-1">Inicio</h3>
                <p className="text-sm text-gray-500 mb-6">
                    Ingresos de todos tus avatares en Fanvue y Telegram
                </p>
                <Alert type="warning" showIcon>
                    No se pudieron cargar los ingresos. Las conexiones y el
                    resto de la app no se ven afectadas.
                    {result.error ? ` (${result.error})` : ''}
                </Alert>
            </Container>
        )
    }

    return (
        <Container className="py-6">
            <HomeDashboardView data={result.data} />
        </Container>
    )
}
