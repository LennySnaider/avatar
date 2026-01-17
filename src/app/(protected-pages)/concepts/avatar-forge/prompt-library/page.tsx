import { auth } from '@/auth'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import PromptLibraryProvider from './_components/PromptLibraryProvider'
import PromptList from './_components/PromptList'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { Prompt } from '@/@types/supabase'

export default async function Page() {
    const session = await auth()

    let prompts: Prompt[] = []

    if (session?.user?.id) {
        const supabase = createServerSupabaseClient()
        const { data, error } = await supabase
            .from('prompts')
            .select('*')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })

        if (!error && data) {
            prompts = data
        }
    }

    return (
        <PromptLibraryProvider prompts={prompts}>
            <Container>
                <AdaptiveCard>
                    <PromptList userId={session?.user?.id} />
                </AdaptiveCard>
            </Container>
        </PromptLibraryProvider>
    )
}
