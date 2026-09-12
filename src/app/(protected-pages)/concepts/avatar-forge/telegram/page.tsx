import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Container from '@/components/shared/Container'
import Card from '@/components/ui/Card'
import Tag from '@/components/ui/Tag'
import { getOrgContext } from '@/lib/tenant/getOrgContext'
import { orgTable } from '@/lib/org/orgTable'

interface AvatarCard {
    id: string
    name: string
}

interface TelegramSettingsCard {
    avatar_id: string
    enabled: boolean
    bot_username: string | null
}

/** Telegram index: every avatar with its bot connection state, linking to its channel page. */
export default async function Page() {
    const session = await auth()
    if (!session?.user?.id) redirect('/sign-in')

    // Mismo criterio "vacío, no throw" que agent/page.tsx: getOrgContext()
    // lanza si el usuario autenticado no tiene fila en organization_members, y
    // eso no debe tumbar la página en un 500 (no hay error.tsx aquí).
    let avatars: AvatarCard[] = []
    let settingsByAvatar = new Map<string, TelegramSettingsCard>()
    try {
        const ctx = await getOrgContext()
        const [{ data: avatarRows }, { data: settingsRows }] = await Promise.all([
            orgTable(ctx, 'avatars')
                .select('id, name')
                .order('created_at', { ascending: true }),
            orgTable(ctx, 'avatar_telegram_settings').select(
                'avatar_id, enabled, bot_username',
            ),
        ])
        avatars = (avatarRows ?? []) as AvatarCard[]
        settingsByAvatar = new Map(
            ((settingsRows ?? []) as TelegramSettingsCard[]).map((s) => [s.avatar_id, s]),
        )
    } catch (e) {
        console.warn('[telegram] no se pudo listar avatares/ajustes', e)
    }

    return (
        <Container className="py-6">
            <h3 className="mb-1">Telegram</h3>
            <p className="text-sm text-gray-500 mb-6">
                Connect a bot per avatar and sell paid content with Telegram Stars
            </p>

            {avatars.length === 0 ? (
                <Card>
                    <p className="text-sm text-gray-500">
                        No avatars yet — create one in Avatar Studio first.
                    </p>
                </Card>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {avatars.map((avatar) => {
                        const settings = settingsByAvatar.get(avatar.id)
                        return (
                            <Link
                                key={avatar.id}
                                href={`/concepts/avatar-forge/telegram/${avatar.id}`}
                            >
                                <Card clickable className="h-full">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <h6 className="font-bold">{avatar.name}</h6>
                                        {!settings ? (
                                            <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-100 border-0">
                                                Not connected
                                            </Tag>
                                        ) : settings.enabled ? (
                                            <Tag className="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-100 border-0">
                                                Connected
                                            </Tag>
                                        ) : (
                                            <Tag className="bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-100 border-0">
                                                Disconnected
                                            </Tag>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-400">
                                        {settings?.bot_username
                                            ? `@${settings.bot_username}`
                                            : 'Click to connect a bot'}
                                    </p>
                                </Card>
                            </Link>
                        )
                    })}
                </div>
            )}
        </Container>
    )
}
