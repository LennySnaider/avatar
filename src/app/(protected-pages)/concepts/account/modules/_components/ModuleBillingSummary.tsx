/**
 * Cuota y comisiones del mes en curso para un módulo. Server component: lee
 * el ledger directamente, sin pasar por una action.
 */
import Alert from '@/components/ui/Alert'
import Card from '@/components/ui/Card'
import { getModuleBillingSummary } from '@/lib/billing/moduleSummary'
import { MODULE_SKU } from '@/lib/billing/catalog'

export default async function ModuleBillingSummary({
    organizationId,
    slug,
}: {
    organizationId: string
    slug: string
}) {
    let summary: Awaited<ReturnType<typeof getModuleBillingSummary>> | null = null
    try {
        summary = await getModuleBillingSummary(organizationId, slug)
    } catch (e) {
        // Pantalla de dinero: no puede tumbar la página de módulos entera.
        // ModulesClient (instalar/desinstalar) ya se renderizó arriba y no
        // depende de esta lectura, y esta ruta no tiene error.tsx propio que
        // aísle sólo esta sección — así que el aislamiento se hace aquí.
        console.error(`[modules] ModuleBillingSummary(${slug}):`, e)
        return (
            <Alert type="warning" showIcon>
                No se pudo cargar el resumen de facturación de este módulo. Instalar y
                desinstalar no se ven afectados.
            </Alert>
        )
    }

    const feeSku = MODULE_SKU.fee(slug)

    return (
        <div className="flex flex-col gap-4">
            {summary.truncated && (
                <Alert type="warning" showIcon>
                    Hay más movimientos este mes de los que se pudieron leer de una vez: los
                    totales de abajo pueden estar incompletos.
                </Alert>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <span>Cuota del mes</span>
                    <h4>{summary.feeChargedTokens.toLocaleString()} tokens</h4>
                </Card>
                <Card>
                    <span>Comisiones del mes</span>
                    <h4>{summary.commissionTokens.toLocaleString()} tokens</h4>
                    <span>${summary.commissionUsd.toFixed(2)}</span>
                </Card>
                <Card>
                    <span>Ventas comisionadas</span>
                    <h4>{summary.salesCount}</h4>
                </Card>
            </div>

            {summary.entries.length > 0 && (
                <Card>
                    <h6>Movimientos de {summary.period}</h6>
                    <div className="overflow-x-auto mt-2">
                        <table className="w-full">
                            <thead>
                                <tr>
                                    <th className="text-left">Fecha</th>
                                    <th className="text-left">Concepto</th>
                                    <th className="text-right">Tokens</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.entries.map((e) => (
                                    <tr key={e.id}>
                                        <td>{new Date(e.createdAt).toLocaleDateString()}</td>
                                        <td>{e.sku === feeSku ? 'Cuota mensual' : 'Comisión de venta'}</td>
                                        <td className="text-right">{Math.abs(e.tokens).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    )
}
