import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Container from '@/components/shared/Container'
import Card from '@/components/ui/Card'
import FanvueComposer from './_components/FanvueComposer'
import { getRowMediaUrl } from '@/lib/storagePaths'
import { getOrgContext, type OrgContext } from '@/lib/tenant/getOrgContext'
import { orgTable } from '@/lib/org/orgTable'
import {
    getFanvueConnection,
    listFanvueCreators,
} from '@/services/FanvueService'
import type { PageProps } from '@/@types/common'
import type { MediaType } from '@/@types/supabase'

export interface ComposerGeneration {
    id: string
    mediaType: MediaType
    publicUrl: string
    prompt: string
}

export default async function Page({ searchParams }: PageProps) {
    const session = await auth()
    // OJO: `redirect()` funciona LANZANDO NEXT_REDIRECT, así que va FUERA del
    // try — un catch se lo tragaría y la página seguiría renderizando.
    if (!session?.user?.id) {
        redirect('/sign-in')
    }

    // getOrgContext() lanza por DOS motivos (sin sesión, sin fila en
    // organization_members) y el redirect de arriba sólo cubre el primero: un
    // usuario autenticado pero sin membresía se llevaba un 500 genérico (no
    // hay error.tsx en (protected-pages)). Mismo contrato "vacío, no throw"
    // que getAvatarAgentData (685cf32): sin org no hay galería que ofrecer y
    // la página cae en la tarjeta de "conecta tu agencia" que ya existe.
    let ctx: OrgContext | null = null
    try {
        ctx = await getOrgContext()
    } catch (e) {
        // Con log: un catch mudo haría pasar una caída de BD por "no tienes
        // nada", y nadie se entera.
        console.warn('[fanvue/composer] sin contexto de organizacion', e)
    }

    const params = await searchParams
    const generationId =
        typeof params.generationId === 'string'
            ? params.generationId
            : undefined

    const [connectionResult, creatorsResult, generations] = await Promise.all([
        getFanvueConnection(),
        listFanvueCreators(),
        (async (): Promise<ComposerGeneration[]> => {
            if (!ctx) return []
            // '*': la URL depende de `storage_provider` (era R2) y esa columna
            // puede no existir todavía — nombrarla rompería la query.
            const { data } = await orgTable(ctx, 'generations')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(24)
            return ((data ?? []) as { id: string; media_type: MediaType; storage_path: string; storage_provider?: string | null; prompt: string }[]).map((g) => ({
                id: g.id,
                mediaType: g.media_type,
                publicUrl: getRowMediaUrl(g),
                prompt: g.prompt,
            }))
        })(),
    ])

    const connected = connectionResult.success
        ? !!connectionResult.data?.connected
        : false
    const creators = creatorsResult.success ? (creatorsResult.data ?? []) : []

    return (
        <Container className="py-6">
            <h3 className="mb-1">New Fanvue post</h3>
            <p className="text-sm text-gray-500 mb-6">
                Publish a generation to Fanvue on behalf of one of your managed
                creators
            </p>

            {!connected ? (
                <Card>
                    <p className="mb-4 text-sm text-gray-500">
                        Connect your Fanvue agency before you can publish.
                    </p>
                    <Link
                        href="/concepts/avatar-forge/fanvue/accounts"
                        className="button inline-flex items-center justify-center h-12 px-5 py-2 rounded-xl bg-primary hover:bg-primary-mild text-neutral button-press-feedback"
                    >
                        Go to Fanvue Agency
                    </Link>
                </Card>
            ) : (
                <FanvueComposer
                    creators={creators}
                    generations={generations}
                    initialGenerationId={generationId}
                />
            )}
        </Container>
    )
}
