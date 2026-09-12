import { getOrgContext } from '@/lib/tenant/getOrgContext'
import { listModules } from '@/services/ModulesService'
import ModulesClient from './_components/ModulesClient'
import ModuleBillingSummary from './_components/ModuleBillingSummary'

export default async function ModulesPage() {
    const ctx = await getOrgContext()
    const res = await listModules()
    if (!res.success || !res.data) {
        return <div className="p-6 text-red-500">{res.error ?? 'No se pudo cargar el catálogo.'}</div>
    }

    const installedSlugs = res.data.installed
        .filter((m) => m.status === 'installed')
        .map((m) => m.moduleSlug)

    return (
        <div className="flex flex-col gap-6">
            <ModulesClient
                catalog={res.data.catalog}
                installed={res.data.installed}
                canManage={res.data.canManage}
            />
            {installedSlugs.map((slug) => (
                <ModuleBillingSummary key={slug} organizationId={ctx.organizationId} slug={slug} />
            ))}
        </div>
    )
}
