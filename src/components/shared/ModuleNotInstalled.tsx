/**
 * Lo que ve quien entra por URL a un módulo que su organización no tiene.
 * No es un 404 a propósito: la ruta existe y la respuesta útil es cómo
 * activarla, no negar que exista.
 *
 * Este fichero es `async`, así que Next lo trata como Server Component de
 * verdad. Por eso NO importa aquí ningún componente de `@/components/ui`:
 * toda la parte visual vive en `ModuleNotInstalledCard`, que sí es cliente.
 * El porqué exacto está explicado en la cabecera de ese fichero.
 */
import ModuleNotInstalledCard from './ModuleNotInstalledCard'
import { getModuleDefinition } from '@/lib/modules/catalog'

export default async function ModuleNotInstalled({
    slug,
    suspended = false,
}: {
    slug: string
    suspended?: boolean
}) {
    const def = await getModuleDefinition(slug)

    const pricing = def
        ? `$${def.priceUsdMonthPerUnit.toFixed(2)} por ${def.unit} al mes · comisión ` +
          `${def.commissionAiPct}% (IA) / ${def.commissionManualPct}% (manual)`
        : undefined

    return (
        <ModuleNotInstalledCard
            title={def?.name ?? slug}
            suspended={suspended}
            pricing={pricing}
        />
    )
}
