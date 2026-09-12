/**
 * Lo que ve quien entra por URL a un módulo que su organización no tiene.
 * No es un 404 a propósito: la ruta existe y la respuesta útil es cómo
 * activarla, no negar que exista.
 */
import Link from 'next/link'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { getModuleDefinition } from '@/lib/modules/catalog'

export default async function ModuleNotInstalled({
    slug,
    suspended = false,
}: {
    slug: string
    suspended?: boolean
}) {
    const def = await getModuleDefinition(slug)
    return (
        <div className="flex justify-center p-6">
            <Card className="max-w-xl">
                <h4>{def?.name ?? slug}</h4>
                <p className="mt-2">
                    {suspended
                        ? 'Este módulo está suspendido. Revisa tu saldo para reactivarlo.'
                        : 'Este módulo no está instalado en tu organización.'}
                </p>
                {def && (
                    <p className="mt-2">
                        ${def.priceUsdMonthPerUnit.toFixed(2)} por {def.unit} al mes · comisión{' '}
                        {def.commissionAiPct}% (IA) / {def.commissionManualPct}% (manual)
                    </p>
                )}
                <div className="mt-4">
                    <Link href={suspended ? '/concepts/account/settings?tab=billing' : '/concepts/account/modules'}>
                        <Button asElement="div" variant="solid">{suspended ? 'Ver saldo' : 'Ir a Módulos'}</Button>
                    </Link>
                </div>
            </Card>
        </div>
    )
}
