import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ProvidersManager from './_components/ProvidersManager'
// Del catálogo UNIVERSAL (sin 'use client') — importar el catálogo vía el
// drawer (client) desde este server component entregaba referencias RSC
// opacas ("DEFAULT_PROVIDERS is not iterable").
import { DEFAULT_PROVIDERS } from '../_shared/providerCatalog'

/**
 * AI Providers — catálogo REAL: los mismos providers cableados que usa el
 * selector del Avatar Studio (DEFAULT_PROVIDERS), no la tabla ai_providers
 * (vacía/desactualizada). El server chequea la PRESENCIA real de cada API key
 * en el entorno para el badge Active/Inactive.
 */
export default async function Page() {
    const envVars = new Set<string>(['MINIMAX_API_KEY'])
    for (const p of DEFAULT_PROVIDERS) {
        if (p.api_key_env_var) envVars.add(p.api_key_env_var)
    }
    const envStatus: Record<string, boolean> = {}
    for (const v of envVars) {
        envStatus[v] = Boolean(process.env[v]?.trim())
    }

    return (
        <Container>
            <AdaptiveCard>
                <ProvidersManager envStatus={envStatus} />
            </AdaptiveCard>
        </Container>
    )
}
