import { listModules } from '@/services/ModulesService'
import ModulesClient from './_components/ModulesClient'

export default async function ModulesPage() {
    const res = await listModules()
    if (!res.success || !res.data) {
        return <div className="p-6 text-red-500">{res.error ?? 'No se pudo cargar el catálogo.'}</div>
    }
    return (
        <ModulesClient
            catalog={res.data.catalog}
            installed={res.data.installed}
            canManage={res.data.canManage}
        />
    )
}
