/**
 * GET /api/cron/agent-inbox-poll
 *
 * Fallback for the Fanvue webhook (see vercel.json, every 5 min): pulls recent
 * chats/messages for every avatar with an enabled persona + connected Fanvue
 * account, so drafts still appear if a webhook is missed (or not configured in
 * dev). Reuses AgentInboxService.syncFanvueInbox per avatar via its owner.
 *
 * NO despacha la cola de autopilot: de eso se ocupa `agent-autopilot-flush`
 * (cada minuto), su ÚNICO dueño. Cuando este cron también la barría, los dos
 * seleccionaban la misma lista en los minutos :00/:05/:10… y el mismo mensaje
 * — y la misma media de pago — salía dos veces.
 *
 * Gated by CRON_SECRET (Bearer), same as the other crons.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { agentSupabase } from '@/lib/agent/db'
import { loadConnection } from '@/lib/fanvue/tokenStore'
import {
    ingestMessage,
    makeFanvueClient,
    messageDirection,
    resolveTargetAvatar,
    upsertChat,
} from '@/lib/agent/inboxSync'
import { generateDraftReply } from '@/lib/agent/draftPipeline'
import { maybeAutopilotSend } from '@/lib/agent/autopilot'

export const dynamic = 'force-dynamic'
export const maxDuration = 120
/** Se deja de empezar chats nuevos pasado esto: con el tope de 25 s por
 *  llamada a Fanvue (FanvueClient), la vuelta termina limpia antes de que
 *  Vercel la mate a los 120 s. Lo que quede, en la vuelta siguiente. */
const TIME_BUDGET_MS = 85_000

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (secret && authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    // F4.2 Tarea 4 — EXENTO de `orgTable`: el cron corre SIN sesión (lo
    // autoriza CRON_SECRET, no un usuario) y su trabajo es precisamente barrer
    // TODAS las orgs. No hay `ctx` que resolver aquí; la org de cada avatar
    // sale de `avatar.organization_id` (la fila ya cargada más abajo) y se
    // propaga a `resolveTargetAvatar`, y las escrituras cuelgan de esa org
    // resuelta.
    const supabase = agentSupabase()
    // Avatars whose persona is enabled — the only ones worth polling.
    const { data: personas } = await supabase
        .from('avatar_personas')
        .select('avatar_id')
        .eq('enabled', true)
        .limit(500)
    const avatarIds = [...new Set((personas ?? []).map((p) => p.avatar_id))]
    if (avatarIds.length === 0)
        return NextResponse.json({ polled: 0, chats: 0, drafts: 0 })

    const { data: avatars } = await supabase
        .from('avatars')
        .select('id, user_id, organization_id, fanvue_creator_uuid')
        .in('id', avatarIds)

    let polled = 0
    let chatCount = 0
    let drafts = 0
    /** Chats que Fanvue marca `isCreator` — diagnóstico: el 2026-09-21 había
     *  0 marcados en producción con creadoras spameando a MiaUltra, así que
     *  la marca real la pone el humano ("Hide as spam"). Si esto sale > 0,
     *  Fanvue sí distingue a alguien. */
    let fanvueCreators = 0
    /** Chats que no se descargaron: sin mensajes nuevos, u ocultos como spam. */
    let skipped = 0
    const startedAt = Date.now()
    let budgetExhausted = false

    for (const avatar of avatars ?? []) {
        if (budgetExhausted) break
        if (!avatar.user_id) continue
        // One connection per owner; skip if not connected.
        const connection = await loadConnection(avatar.user_id)
        if (!connection?.refreshToken && !connection?.accessToken) continue

        const creatorUuid = avatar.fanvue_creator_uuid ?? null
        // La org sale de la FILA que ya está cargada (avatar.organization_id),
        // no de resolver la membresía del owner: la PRIMERA membresía de un
        // usuario no tiene por qué ser la org de ESTE avatar — si no
        // coinciden, el avatar no se encuentra y el cron falla en silencio.
        const target = await resolveTargetAvatar(
            avatar.user_id,
            creatorUuid,
            connection.fanvueAccountUuid,
            avatar.organization_id,
        )
        if (!target || !target.personaEnabled) continue

        const client = makeFanvueClient(avatar.user_id)
        const creatorSideUuids = new Set<string>(
            [creatorUuid, connection.fanvueAccountUuid].filter(
                (v): v is string => Boolean(v),
            ),
        )

        try {
            const chatsRes = await client.listChats(creatorUuid, {
                page: 1,
                size: 15,
            })
            polled++
            fanvueCreators += chatsRes.data.filter((s) => s.isCreator).length

            // Lo que ya tenemos de cada chat. Antes se pedían los mensajes de
            // los 15 chats en CADA vuelta, hubiera novedad o no, y los de
            // otras creadoras (vixenbabe, sophiabell…) se colgaban hasta el
            // tope de 25 s: el cron moría por timeout de Vercel en todas las
            // vueltas del 2026-09-21.
            const { data: knownRows } = await supabase
                .from('agent_chats')
                .select('external_chat_id, last_message_at, is_creator')
                .eq('organization_id', target.organizationId)
                .eq('avatar_id', target.avatarId)
                .eq('platform', 'fanvue')
                .in(
                    'external_chat_id',
                    chatsRes.data.map((s) => s.user.uuid),
                )
            const known = new Map(
                (knownRows ?? []).map((k) => [k.external_chat_id, k]),
            )

            for (const summary of chatsRes.data) {
                if (Date.now() - startedAt > TIME_BUDGET_MS) {
                    budgetExhausted = true
                    break
                }
                const prev = known.get(summary.user.uuid)
                // Oculto como spam / otra creadora: ni se toca. Sus mensajes
                // no aportan nada y eran los más caros — Sophia Bell (cientos
                // de masivos) devolvía 500 en `/messages` en cada vuelta.
                if (prev?.is_creator) {
                    skipped++
                    continue
                }
                // Sin novedad desde lo último que se ingirió: nada que pedir.
                if (
                    prev?.last_message_at &&
                    summary.lastMessageAt &&
                    Date.parse(summary.lastMessageAt) <=
                        Date.parse(prev.last_message_at)
                ) {
                    skipped++
                    continue
                }
                // Resiliencia POR CHAT: Fanvue devuelve 400 "Invalid user
                // UUID" en /messages para hilos cuyo interlocutor no es un
                // fan normal (cuentas creator/oficiales, p.ej. creator-coach
                // — verificado con barrido en vivo 2026-07-31). Con el catch
                // solo a nivel avatar, UN hilo así mataba la sincronización
                // de los 15 chats en cada corrida del cron, para siempre.
                // Ahora el hilo malo se salta y el resto sigue.
                try {
                    // SIN `lastMessageAt`: se apunta abajo, cuando los
                    // mensajes ya están ingeridos. Si se apuntara aquí y
                    // `/messages` fallara, la vuelta siguiente vería el chat
                    // "al día" y esos mensajes no se pedirían nunca.
                    const chat = await upsertChat({
                        target,
                        fanUuid: summary.user.uuid,
                        fanDisplayName:
                            summary.user.displayName ?? summary.user.handle,
                        fanHandle: summary.user.handle,
                        fanAvatarUrl: summary.user.avatarUrl ?? null,
                        isCreator: Boolean(summary.isCreator),
                    })
                    chatCount++
                    if (chat.is_creator) continue

                    const messagesRes = await client.listChatMessages(
                        creatorUuid,
                        summary.user.uuid,
                        {
                            page: 1,
                            size: 15,
                            markAsRead: false,
                        },
                    )
                    let anyInserted = false
                    for (const m of messagesRes.data) {
                        const { inserted } = await ingestMessage({
                            organizationId: target.organizationId,
                            chatId: chat.id,
                            direction: messageDirection(m, creatorSideUuids),
                            externalMessageId: m.uuid,
                            text: m.text,
                            mediaUuids: m.mediaUuids,
                            externalCreatedAt: m.sentAt,
                        })
                        anyInserted = anyInserted || inserted
                    }
                    // Ya ingerido: ahora sí se apunta hasta dónde llegamos
                    // (lo que la vuelta siguiente compara para saltarse el
                    // chat). Si el webhook apuntó algo más nuevo entretanto,
                    // lo peor es una descarga de más en la vuelta siguiente.
                    if (summary.lastMessageAt) {
                        await supabase
                            .from('agent_chats')
                            .update({ last_message_at: summary.lastMessageAt })
                            .eq('id', chat.id)
                            .eq('organization_id', target.organizationId)
                    }

                    const latest = messagesRes.data[messagesRes.data.length - 1]
                    if (
                        anyInserted &&
                        chat.mode !== 'off' &&
                        !chat.is_creator &&
                        latest &&
                        messageDirection(latest, creatorSideUuids) === 'in'
                    ) {
                        try {
                            const draft = await generateDraftReply(chat.id)
                            drafts++
                            if (draft && chat.mode === 'auto') {
                                await maybeAutopilotSend(
                                    chat.id,
                                    draft.messageId,
                                )
                            }
                        } catch (e) {
                            console.warn(
                                '[agent-inbox-poll] draft/autopilot failed',
                                e,
                            )
                        }
                    }
                } catch (e) {
                    console.warn(
                        `[agent-inbox-poll] chat ${summary.user.handle ?? summary.user.uuid} saltado (avatar ${avatar.id}):`,
                        e instanceof Error ? e.message : e,
                    )
                }
            }
        } catch (e) {
            console.warn(
                '[agent-inbox-poll] poll failed for avatar',
                avatar.id,
                e,
            )
        }
    }

    if (polled > 0) {
        console.log(
            `[agent-inbox-poll] ${polled} avatares · ${chatCount} chats descargados · ${skipped} sin novedad u ocultos · ${fanvueCreators} marcados creador por Fanvue · ${drafts} borradores${budgetExhausted ? ' · CORTADO por tiempo' : ''}`,
        )
    }
    return NextResponse.json({
        polled,
        chats: chatCount,
        drafts,
        fanvueCreators,
        skipped,
        budgetExhausted,
    })
}
