import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import GenerationGallery from './_components/GenerationGallery'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { Generation } from '@/@types/supabase'

interface GenerationWithUrl extends Generation {
    signedUrl?: string
}

export default async function Page() {
    const session = await auth()

    if (!session?.user?.id) {
        redirect('/sign-in')
    }

    const supabase = createServerSupabaseClient()

    // Fetch user's generations
    const { data: generations, error } = await supabase
        .from('generations')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false }) as { data: Generation[] | null, error: unknown }

    if (error) {
        console.error('Error fetching generations:', error)
    }

    // Get signed URLs for each generation
    const generationsWithUrls: GenerationWithUrl[] = await Promise.all(
        (generations || []).map(async (gen) => {
            const { data: signedUrl } = await supabase.storage
                .from('generations')
                .createSignedUrl(gen.storage_path, 3600) // 1 hour expiry

            return {
                ...gen,
                signedUrl: signedUrl?.signedUrl,
            }
        })
    )

    return (
        <Container>
            <AdaptiveCard>
                <GenerationGallery generations={generationsWithUrls} />
            </AdaptiveCard>
        </Container>
    )
}
