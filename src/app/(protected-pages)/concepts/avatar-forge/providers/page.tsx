import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ProviderList from './_components/ProviderList'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { AIProvider } from '@/@types/supabase'

export default async function Page() {
    const supabase = createServerSupabaseClient()

    const { data: providers, error } = await supabase
        .from('ai_providers')
        .select('*')
        .order('name')

    if (error) {
        console.error('Error fetching providers:', error)
    }

    return (
        <Container>
            <AdaptiveCard>
                <ProviderList providers={(providers as AIProvider[]) || []} />
            </AdaptiveCard>
        </Container>
    )
}
