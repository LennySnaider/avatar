import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Container from '@/components/shared/Container'
import { getOrgContext, type OrgContext } from '@/lib/tenant/getOrgContext'
import { orgTable } from '@/lib/org/orgTable'
import { getGenerationMediaUrl } from '@/lib/storagePaths'
import { loadTelegramBotToken } from '@/lib/telegram/settings'
import { buildTelegramWebhookUrl, getMyStarBalance } from '@/lib/telegram/client'
import {
    getTelegramStatus,
    getTelegramWebhookInfo,
    listPaidMediaItems,
} from '@/services/AgentTelegramService'
import TelegramAvatarView from './_components/TelegramAvatarView'
import type {
    GenerationPickerItem,
    TelegramChatListItem,
    TelegramSaleRow,
} from './_components/types'

interface PageProps {
    params: Promise<{ slug: string }>
}

interface GenerationRow {
    id: string
    storage_path: string
    storage_provider: string | null
    media_type: string
    prompt: string
}

interface ChatRow {
    id: string
    fan_display_name: string | null
    fan_handle: string | null
    fan_avatar_url: string | null
    last_message_at: string | null
    last_fan_message_at: string | null
    unread_count: number
}

interface SaleRow {
    id: string
    item_id: string | null
    stars: number
    status: string
    commission_pct: number | null
    commission_tokens: number | null
    commission_settled_at: string | null
    offered_at: string
    purchased_at: string | null
}

export default async function Page({ params }: PageProps) {
    const session = await auth()
    const { slug: avatarId } = await params
    if (!session?.user?.id) redirect('/sign-in')

    // getOrgContext() lanza por DOS motivos (sin sesión, sin fila en
    // organization_members — ver su docblock); el redirect de arriba sólo
    // cubre el primero. Mismo contrato "vacío, no throw" que
    // getAvatarAgentData: sin organización resuelta no hay avatar seguro que
    // devolver, así que cae en el mismo redirect que "avatar no encontrado".
    let ctx: OrgContext | null = null
    try {
        ctx = await getOrgContext()
    } catch (e) {
        console.warn('[telegram/slug] sin contexto de organización', e)
    }
    if (!ctx) redirect('/concepts/avatar-forge/telegram')

    const { data: avatar } = await orgTable(ctx, 'avatars')
        .select('id, name')
        .eq('id', avatarId)
        .maybeSingle()
    // orgTable ya acota por organization_id: si el avatar es de otra
    // organización, esto es null igual que si no existiera — mismo criterio
    // que agent/[slug]/page.tsx (evita el bucle lista → detalle → lista).
    if (!avatar) redirect('/concepts/avatar-forge/telegram')

    // La URL que espera el webhook, para comparar contra la que Telegram dice
    // tener registrada y avisar si el bot quedó apuntando a un sitio muerto.
    const expectedWebhookUrl = buildTelegramWebhookUrl(avatarId)

    const [statusResult, webhookResult, mediaResult] = await Promise.all([
        getTelegramStatus(avatarId),
        getTelegramWebhookInfo(avatarId),
        listPaidMediaItems(avatarId),
    ])
    const status = statusResult.success ? (statusResult.data ?? null) : null
    const webhookInfo = webhookResult.success ? (webhookResult.data ?? null) : null
    const items = mediaResult.success ? (mediaResult.data ?? []) : []

    // Balance de Stars del bot. `loadTelegramBotToken` es la variante SIN
    // sesión (settings.ts) — segura de usar aquí porque ya confirmamos arriba
    // que `avatarId` pertenece a esta organización, y porque un Server
    // Component nunca se envía al cliente: el token entra y sale de esta
    // función sin cruzar jamás la frontera de red hacia el navegador (CANDADO
    // 2 de AgentTelegramService.ts / docblock de settings.ts). Se pide
    // aunque el bot esté desconectado (`enabled=false`): Telegram conserva el
    // saldo aunque el webhook esté apagado.
    let starBalance: number | null = null
    try {
        const token = await loadTelegramBotToken(avatarId)
        if (token) {
            const balance = await getMyStarBalance(token)
            starBalance = balance.amount
        }
    } catch (e) {
        console.warn('[telegram/slug] no se pudo leer el balance de Stars', e)
    }

    // Generaciones del avatar para "Añadir desde generaciones" (Step 3). Sólo
    // las columnas que el brief confirma que existen — mismo patrón que
    // ComposerGeneration en fanvue/composer/page.tsx: URL resuelta aquí
    // (server), el cliente sólo pinta strings.
    const { data: generationRows } = await orgTable(ctx, 'generations')
        .select('id, storage_path, storage_provider, media_type, prompt')
        .eq('avatar_id', avatarId)
        .order('created_at', { ascending: false })
        .limit(60)
    const generations: GenerationPickerItem[] = ((generationRows ?? []) as GenerationRow[]).map(
        (g) => ({
            id: g.id,
            mediaType: g.media_type === 'VIDEO' ? 'VIDEO' : 'IMAGE',
            mediaUrl: getGenerationMediaUrl(g.storage_path, g.storage_provider),
            prompt: g.prompt,
        }),
    )

    // Conversaciones de Telegram de este avatar (Step 4). `agent_chats` es
    // compartida con Fanvue (ver docblock de sendPaidMediaFromInbox): filtrar
    // por `platform` no es opcional.
    const { data: chatRows } = await orgTable(ctx, 'agent_chats')
        .select(
            'id, fan_display_name, fan_handle, fan_avatar_url, last_message_at, last_fan_message_at, unread_count',
        )
        .eq('avatar_id', avatarId)
        .eq('platform', 'telegram')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(100)
    const chats: TelegramChatListItem[] = ((chatRows ?? []) as ChatRow[]).map((c) => ({
        id: c.id,
        fanDisplayName: c.fan_display_name,
        fanHandle: c.fan_handle,
        fanAvatarUrl: c.fan_avatar_url,
        lastMessageAt: c.last_message_at,
        lastFanMessageAt: c.last_fan_message_at,
        unreadCount: c.unread_count,
    }))

    // Ventas recientes (Step 5), con el título resuelto contra la galería que
    // ya cargamos arriba — evita una segunda consulta y refleja el mismo
    // "Contenido eliminado" que vería la propia galería si el ítem ya no
    // existe (on delete set null en telegram_stars_sales.item_id).
    const itemTitleById = new Map(items.map((i) => [i.id, i.title]))
    const { data: saleRows } = await orgTable(ctx, 'telegram_stars_sales')
        .select(
            'id, item_id, stars, status, commission_pct, commission_tokens, commission_settled_at, offered_at, purchased_at',
        )
        .eq('avatar_id', avatarId)
        .order('offered_at', { ascending: false })
        .limit(50)
    const sales: TelegramSaleRow[] = ((saleRows ?? []) as SaleRow[]).map((s) => ({
        id: s.id,
        itemTitle: s.item_id ? (itemTitleById.get(s.item_id) ?? null) : null,
        stars: s.stars,
        status: s.status,
        commissionSettled: !!s.commission_settled_at,
        commissionPct: s.commission_pct,
        commissionTokens: s.commission_tokens,
        offeredAt: s.offered_at,
        purchasedAt: s.purchased_at,
    }))

    return (
        <Container className="py-6">
            <h3 className="mb-1">{avatar.name} — Telegram</h3>
            <p className="text-sm text-gray-500 mb-6">
                Connect a Telegram bot for this avatar and sell paid content with Stars
            </p>
            <TelegramAvatarView
                avatarId={avatarId}
                initialStatus={status}
                initialWebhookInfo={webhookInfo}
                expectedWebhookUrl={expectedWebhookUrl}
                initialItems={items}
                generations={generations}
                initialChats={chats}
                initialSales={sales}
                starBalance={starBalance}
            />
        </Container>
    )
}
