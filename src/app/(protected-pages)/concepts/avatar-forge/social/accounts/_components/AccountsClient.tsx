'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import {
    assignSocialProfileToAvatar,
    createSocialProfileForAvatar,
    registerUploadPostWebhook,
    syncConnectedAccounts,
    syncUploadPostProfiles,
    unassignSocialProfile,
    updateSocialCommentSettings,
    type AvatarSocialAccountRow,
    type SocialProfileSummary,
    type SocialCommentSettingsPatch,
    type UploadPostAgencySummary,
} from '@/services/SocialService'

interface AccountsClientProps {
    initialAgency: UploadPostAgencySummary | null
    initialAccounts: AvatarSocialAccountRow[]
    loadError: string | null
}

interface ConnectedAccountChip {
    platform?: string
    accountName?: string
    avatarUrl?: string
    reauthRequired?: boolean
}

interface ProfileOption {
    value: string
    label: string
}

/** Connected platforms come back either as bare strings or account objects. */
function toChip(p: unknown): ConnectedAccountChip {
    if (typeof p === 'string') return { platform: p }
    const obj = (p ?? {}) as Record<string, unknown>
    return {
        platform: typeof obj.platform === 'string' ? obj.platform : undefined,
        accountName: typeof obj.accountName === 'string' ? obj.accountName : undefined,
        avatarUrl: typeof obj.avatarUrl === 'string' ? obj.avatarUrl : undefined,
        reauthRequired: obj.reauthRequired === true,
    }
}

/** `username · instagram, x (external)` — lo que ve quien elige un perfil libre. */
function profileOptionLabel(profile: SocialProfileSummary): string {
    const platforms = profile.connectedPlatforms
        .map(toChip)
        .map((chip) => chip.platform)
        .filter((p): p is string => Boolean(p))
    const base =
        platforms.length > 0
            ? `${profile.uploadPostUsername} · ${platforms.join(', ')}`
            : profile.uploadPostUsername
    return profile.isExternal ? `${base} (external)` : base
}

const AMBER_TAG = 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-100 border-0'
const GREEN_TAG = 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-100 border-0'
const GRAY_TAG = 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-100 border-0'

function statusTag(profile: SocialProfileSummary | null, needsReauth: boolean) {
    if (!profile || profile.status !== 'active') {
        return <Tag className={AMBER_TAG}>No profile</Tag>
    }
    if (needsReauth) {
        return <Tag className={AMBER_TAG}>Needs re-auth</Tag>
    }
    return <Tag className={GREEN_TAG}>Connected</Tag>
}

const ACCOUNTS_PATH = '/concepts/avatar-forge/social/accounts'

const CHAT_MODE_OPTIONS: { value: 'draft' | 'auto'; label: string }[] = [
    { value: 'draft', label: 'Draft (review in Inbox)' },
    { value: 'auto', label: 'Auto (autopilot rules apply)' },
]

const MAX_DM_BUTTONS = 3

interface DmDraftButton {
    /** Key estable para la fila — `existing-N` al hidratar desde el perfil
     *  (índice, nunca cambia mientras no se edite la lista) o un uuid al
     *  agregar un botón nuevo. Nunca se manda al servidor (sólo title/url). */
    id: string
    title: string
    url: string
}

interface DmDraft {
    text: string
    buttons: DmDraftButton[]
}

/** id → nunca undefined ni bajo SSR: `crypto.randomUUID` existe en todos los
 *  navegadores que corren esta pantalla (cliente, `'use client'`). */
function newDmButtonId(): string {
    return crypto.randomUUID()
}

/**
 * Cuenta AGENCIA de Upload-Post (2026-09-17): una sola key de la plataforma
 * (env, nunca llega aquí) y un catálogo de perfiles (sub-users) que se
 * asignan a los avatares — calcado de la pantalla de Fanvue (agencia +
 * creators). Arriba, la card de la agencia (plan, N / límite, Refresh
 * profiles, webhook, perfiles libres); abajo, una card por avatar: sin perfil
 * → asignar uno libre o crear el suyo; con perfil → conectar redes, refrescar,
 * desasignar, y los ajustes de IA en comentarios.
 */
const AccountsClient = ({ initialAgency, initialAccounts, loadError }: AccountsClientProps) => {
    const [agency, setAgency] = useState<UploadPostAgencySummary | null>(initialAgency)
    const [agencyBusy, setAgencyBusy] = useState(false)
    const [accounts, setAccounts] = useState<AvatarSocialAccountRow[]>(initialAccounts)
    const [error, setError] = useState<string | null>(loadError)
    const [cardErrors, setCardErrors] = useState<Record<string, string>>({})
    const [assignSelection, setAssignSelection] = useState<Record<string, string>>({})
    const [busyAvatar, setBusyAvatar] = useState<string | null>(null)
    const [confirmUnassign, setConfirmUnassign] = useState<AvatarSocialAccountRow | null>(null)
    // Campos de "IA en comentarios" guardándose ahora mismo — mismo patrón
    // que `savingAi` en TelegramConnectionPanel, pero con clave
    // `${avatarId}:${field}` (no sólo `avatarId`): esta pantalla lista
    // varios avatares Y, dentro de cada uno, el switch de respuestas y el
    // Select de modo pueden guardarse casi a la vez — con una sola clave por
    // avatar el segundo guardado pisaba el spinner del primero.
    const [savingFields, setSavingFields] = useState<Record<string, boolean>>({})
    const [savingDm, setSavingDm] = useState<string | null>(null)
    // Borrador local del texto/botones del DM — sólo se guarda al pulsar
    // "Save DM". Antes de que el usuario toque algo, se lee del perfil.
    const [dmDrafts, setDmDrafts] = useState<Record<string, DmDraft>>({})
    const router = useRouter()
    const searchParams = useSearchParams()
    const handledConnectParams = useRef(false)

    const applyProfile = (avatarId: string, profile: SocialProfileSummary | null) => {
        setAccounts((prev) =>
            prev.map((a) => (a.avatarId === avatarId ? { ...a, profile } : a)),
        )
    }

    const setCardError = (avatarId: string, message: string | null) => {
        setCardErrors((prev) => {
            const next = { ...prev }
            if (message) next[avatarId] = message
            else delete next[avatarId]
            return next
        })
    }

    const removeUnassigned = (profileId: string) => {
        setAgency((prev) =>
            prev ? { ...prev, unassigned: prev.unassigned.filter((p) => p.id !== profileId) } : prev,
        )
    }

    const addUnassigned = (profile: SocialProfileSummary) => {
        setAgency((prev) => {
            if (!prev) return prev
            const rest = prev.unassigned.filter((p) => p.id !== profile.id)
            const unassigned = [...rest, profile].sort((a, b) =>
                a.uploadPostUsername.localeCompare(b.uploadPostUsername),
            )
            return { ...prev, unassigned }
        })
    }

    const handleCreateProfile = async (avatarId: string) => {
        setBusyAvatar(avatarId)
        setCardError(avatarId, null)
        try {
            const result = await createSocialProfileForAvatar(avatarId)
            if (result.success && result.data) {
                applyProfile(avatarId, result.data)
                removeUnassigned(result.data.id)
                toast.push(
                    <Notification type="success" title="Profile created">
                        {result.data.uploadPostUsername} is on the agency account — now connect its
                        social networks
                    </Notification>,
                )
            } else {
                setCardError(avatarId, result.error ?? 'Failed to create profile')
            }
        } finally {
            setBusyAvatar(null)
        }
    }

    const handleAssign = async (avatarId: string) => {
        const profileId = assignSelection[avatarId]
        if (!profileId) {
            setCardError(avatarId, 'Pick a free profile first')
            return
        }
        setBusyAvatar(avatarId)
        setCardError(avatarId, null)
        try {
            const result = await assignSocialProfileToAvatar(avatarId, profileId)
            if (result.success && result.data) {
                applyProfile(avatarId, result.data)
                removeUnassigned(profileId)
                setAssignSelection((prev) => {
                    const next = { ...prev }
                    delete next[avatarId]
                    return next
                })
                toast.push(
                    <Notification type="success" title="Profile assigned">
                        This avatar now posts through {result.data.uploadPostUsername}
                    </Notification>,
                )
            } else {
                setCardError(avatarId, result.error ?? 'Failed to assign profile')
            }
        } finally {
            setBusyAvatar(null)
        }
    }

    const handleConnectSocials = (avatarId: string) => {
        window.open(
            `/api/social/connect?avatarId=${encodeURIComponent(avatarId)}`,
            '_blank',
            'width=600,height=760',
        )
    }

    const handleRefresh = async (avatarId: string) => {
        setBusyAvatar(avatarId)
        setCardError(avatarId, null)
        try {
            const result = await syncConnectedAccounts(avatarId)
            if (result.success && result.data) {
                applyProfile(avatarId, result.data)
            } else {
                setCardError(avatarId, result.error ?? 'Failed to refresh connected accounts')
            }
        } finally {
            setBusyAvatar(null)
        }
    }

    const handleUnassign = async () => {
        const target = confirmUnassign
        setConfirmUnassign(null)
        if (!target) return
        setBusyAvatar(target.avatarId)
        setCardError(target.avatarId, null)
        try {
            const result = await unassignSocialProfile(target.avatarId)
            if (result.success && result.data) {
                applyProfile(target.avatarId, null)
                addUnassigned(result.data)
                toast.push(
                    <Notification type="info" title="Profile unassigned">
                        The profile stays on the agency account and can be assigned to another
                        avatar. Posts already scheduled on Upload-Post will still publish.
                    </Notification>,
                )
            } else {
                setCardError(target.avatarId, result.error ?? 'Failed to unassign')
            }
        } finally {
            setBusyAvatar(null)
        }
    }

    const handleRefreshProfiles = async () => {
        setAgencyBusy(true)
        setError(null)
        try {
            const result = await syncUploadPostProfiles()
            if (result.success && result.data) {
                setAgency(result.data.agency)
                setAccounts(result.data.accounts)
                toast.push(
                    <Notification type="success" title="Profiles refreshed">
                        {result.data.agency.unassigned.length} free profile(s) on the agency account
                    </Notification>,
                )
            } else {
                setError(result.error ?? 'Failed to refresh profiles')
            }
        } finally {
            setAgencyBusy(false)
        }
    }

    const handleRegisterWebhook = async () => {
        setAgencyBusy(true)
        try {
            const result = await registerUploadPostWebhook()
            toast.push(
                result.success ? (
                    <Notification type="success" title="Webhook registered">
                        Upload-Post will notify this app of publish and account events for the
                        agency account
                    </Notification>
                ) : (
                    <Notification type="danger" title="Webhook registration failed">
                        {result.error ?? 'Unknown error'}
                    </Notification>
                ),
            )
        } finally {
            setAgencyBusy(false)
        }
    }

    const getDmDraft = (account: AvatarSocialAccountRow): DmDraft =>
        dmDrafts[account.avatarId] ?? {
            text: account.profile?.aiCommentDmText ?? '',
            buttons: (account.profile?.aiCommentDmButtons ?? []).map((button, index) => ({
                id: `existing-${index}`,
                ...button,
            })),
        }

    const setDmDraft = (avatarId: string, draft: DmDraft) => {
        setDmDrafts((prev) => ({ ...prev, [avatarId]: draft }))
    }

    /** Borra el borrador local: la próxima lectura (`getDmDraft`) vuelve a
     *  caer en el perfil ya actualizado — así un "Save DM" exitoso refleja
     *  la normalización del servidor (trim, `''`→`null`) en vez de dejar
     *  pegado lo que el usuario tenía tipeado. */
    const clearDmDraft = (avatarId: string) => {
        setDmDrafts((prev) => {
            if (!(avatarId in prev)) return prev
            const next = { ...prev }
            delete next[avatarId]
            return next
        })
    }

    const savingFieldKey = (avatarId: string, field: string) => `${avatarId}:${field}`
    const isFieldSaving = (avatarId: string, field: string) =>
        savingFields[savingFieldKey(avatarId, field)] === true

    /** Guarda un único campo (Switcher/Select) de "IA en comentarios" — se
     *  envía al instante, como los interruptores de Telegram. */
    const saveCommentSetting = async (
        account: AvatarSocialAccountRow,
        field: string,
        patch: SocialCommentSettingsPatch,
    ) => {
        const key = savingFieldKey(account.avatarId, field)
        setSavingFields((prev) => ({ ...prev, [key]: true }))
        try {
            const result = await updateSocialCommentSettings(account.avatarId, patch)
            if (result.success && result.data) {
                applyProfile(account.avatarId, result.data)
                toast.push(<Notification type="success" title="Settings saved" />)
            } else {
                toast.push(
                    <Notification type="danger" title="Could not save AI comment settings">
                        {result.error ?? 'Unknown error'}
                    </Notification>,
                )
            }
        } finally {
            setSavingFields((prev) => ({ ...prev, [key]: false }))
        }
    }

    /** El Switcher del DM nunca manda `aiCommentDmEnabled:true` sin texto
     *  guardado — el servidor lo rechazaría igual, pero avisar aquí evita el
     *  viaje redondo y dice exactamente qué falta. */
    const handleToggleDm = (account: AvatarSocialAccountRow, checked: boolean) => {
        const savedText = account.profile?.aiCommentDmText ?? ''
        if (checked && savedText.trim() === '') {
            toast.push(<Notification type="warning" title="Write and save the DM text first" />)
            return
        }
        saveCommentSetting(account, 'aiCommentDmEnabled', { aiCommentDmEnabled: checked })
    }

    const handleDmTextChange = (account: AvatarSocialAccountRow, text: string) => {
        setDmDraft(account.avatarId, { ...getDmDraft(account), text })
    }

    const handleDmButtonChange = (
        account: AvatarSocialAccountRow,
        index: number,
        field: 'title' | 'url',
        value: string,
    ) => {
        const draft = getDmDraft(account)
        const buttons = draft.buttons.map((button, i) =>
            i === index ? { ...button, [field]: value } : button,
        )
        setDmDraft(account.avatarId, { ...draft, buttons })
    }

    const handleAddDmButton = (account: AvatarSocialAccountRow) => {
        const draft = getDmDraft(account)
        if (draft.buttons.length >= MAX_DM_BUTTONS) return
        setDmDraft(account.avatarId, {
            ...draft,
            buttons: [...draft.buttons, { id: newDmButtonId(), title: '', url: '' }],
        })
    }

    const handleRemoveDmButton = (account: AvatarSocialAccountRow, index: number) => {
        const draft = getDmDraft(account)
        setDmDraft(account.avatarId, {
            ...draft,
            buttons: draft.buttons.filter((_, i) => i !== index),
        })
    }

    const handleSaveDm = async (account: AvatarSocialAccountRow) => {
        const draft = getDmDraft(account)
        setSavingDm(account.avatarId)
        try {
            const result = await updateSocialCommentSettings(account.avatarId, {
                aiCommentDmText: draft.text,
                aiCommentDmButtons: draft.buttons.map(({ title, url }) => ({ title, url })),
            })
            if (result.success && result.data) {
                applyProfile(account.avatarId, result.data)
                // El borrador se borra: la próxima lectura cae en el perfil
                // recién guardado (texto recortado, `''`→`null`, botones tal
                // como los normalizó el servidor) en vez de seguir mostrando
                // lo que el usuario tenía tipeado antes del trim.
                clearDmDraft(account.avatarId)
                toast.push(<Notification type="success" title="DM settings saved" />)
            } else {
                toast.push(
                    <Notification type="danger" title="Could not save DM settings">
                        {result.error ?? 'Unknown error'}
                    </Notification>,
                )
            }
        } finally {
            setSavingDm(null)
        }
    }

    // Reflect `?connected=1&avatarId=...` / `?error=...` set by
    // `/api/social/connect` and `/api/social/callback` after the hosted
    // connect flow. Refreshes just the returning avatar when known. Runs once
    // on mount, then strips the params so back-nav doesn't re-trigger it.
    useEffect(() => {
        if (handledConnectParams.current) return
        const connected = searchParams.get('connected')
        const connectError = searchParams.get('error')
        const avatarId = searchParams.get('avatarId')
        if (!connected && !connectError) return
        handledConnectParams.current = true

        if (connected === '1') {
            if (avatarId) handleRefresh(avatarId)
            toast.push(
                <Notification type="success" title="Account connected">
                    Refreshing the connected social accounts
                </Notification>,
            )
        } else if (connectError) {
            setError(connectError)
        }

        router.replace(ACCOUNTS_PATH)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams])

    const unassigned = agency?.unassigned ?? []
    const profileOptions: ProfileOption[] = unassigned.map((p) => ({
        value: p.id,
        label: profileOptionLabel(p),
    }))
    const agencyFull =
        !!agency &&
        agency.limit !== null &&
        agency.profilesUsed !== null &&
        agency.profilesUsed >= agency.limit
    const canCreate = !!agency?.configured && !agencyFull

    return (
        <div className="flex flex-col gap-4">
            {error && (
                <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                    <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            <Card>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                    <h6 className="font-bold">Upload-Post agency account</h6>
                    {agency?.configured ? (
                        <Tag className={GREEN_TAG}>Connected</Tag>
                    ) : (
                        <Tag className={AMBER_TAG}>Not configured</Tag>
                    )}
                    {agency?.plan && <Tag className={GRAY_TAG}>Plan {agency.plan}</Tag>}
                    {agency && agency.profilesUsed !== null && (
                        <Tag className={agencyFull ? AMBER_TAG : GRAY_TAG}>
                            {agency.profilesUsed} / {agency.limit ?? '?'} profiles
                        </Tag>
                    )}
                    {agency?.keyLast4 && (
                        <span className="text-xs text-gray-400 font-mono">Key ····{agency.keyLast4}</span>
                    )}
                </div>

                {agency && !agency.configured && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">
                        UPLOAD_POST_API_KEY is not set on the server — profiles cannot be created or
                        synced until it is.
                    </p>
                )}
                {agency?.remoteError && (
                    <div className="p-2 mb-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                        <p className="text-xs text-red-600 dark:text-red-400">Upload-Post: {agency.remoteError}</p>
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-2 mb-4">
                    <Button
                        variant="solid"
                        size="sm"
                        loading={agencyBusy}
                        disabled={!agency?.configured}
                        onClick={handleRefreshProfiles}
                    >
                        Refresh profiles
                    </Button>
                    <Button
                        variant="plain"
                        size="sm"
                        disabled={agencyBusy || !agency?.configured}
                        onClick={handleRegisterWebhook}
                    >
                        Register webhook
                    </Button>
                </div>

                <p className="text-sm font-semibold mb-2">Free profiles</p>
                {unassigned.length > 0 ? (
                    <div className="flex flex-col gap-1">
                        {unassigned.map((profile) => (
                            <div key={profile.id} className="flex flex-wrap items-center gap-2 text-sm">
                                <span className="font-mono">{profile.uploadPostUsername}</span>
                                {profile.isExternal && <Tag className={GRAY_TAG}>external</Tag>}
                                {profile.connectedPlatforms.map(toChip).map((chip, idx) => (
                                    <span key={idx} className="text-xs text-gray-400">
                                        <span className="capitalize">{chip.platform}</span>
                                        {chip.accountName ? ` ${chip.accountName}` : ''}
                                    </span>
                                ))}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">
                        {agency?.configured
                            ? 'No free profiles — click "Refresh profiles" to sync the agency account, or create one from an avatar card.'
                            : 'Configure the agency key to load its profiles.'}
                    </p>
                )}
            </Card>

            {accounts.length === 0 && !error && (
                <Card>
                    <p className="text-sm text-gray-500">
                        No avatars yet — create one in Avatar Studio first.
                    </p>
                </Card>
            )}

            {accounts.map((account) => {
                const profile = account.profile
                const isActive = profile?.status === 'active'
                const isBusy = busyAvatar === account.avatarId
                const cardError = cardErrors[account.avatarId]
                const chips = (profile?.connectedPlatforms ?? []).map(toChip)
                const needsReauth = chips.some((chip) => chip.reauthRequired)
                // Fila legacy (cuenta vieja) o perfil borrado en Upload-Post:
                // se dice cual era para que el aviso tenga sentido.
                const previousUsername = profile && !isActive ? profile.uploadPostUsername : null
                const selectedOption =
                    profileOptions.find((o) => o.value === assignSelection[account.avatarId]) ?? null

                return (
                    <Card key={account.avatarId}>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                            <h6 className="font-bold">{account.avatarName}</h6>
                            {statusTag(profile, needsReauth)}
                            {isActive && profile && (
                                <span className="text-xs text-gray-400 font-mono">
                                    Profile {profile.uploadPostUsername}
                                </span>
                            )}
                        </div>

                        {cardError && (
                            <div className="p-2 mb-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                                <p className="text-xs text-red-600 dark:text-red-400">{cardError}</p>
                            </div>
                        )}

                        {!isActive && (
                            <div className="mb-3">
                                {previousUsername && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                                        Previous profile{' '}
                                        <span className="font-mono">{previousUsername}</span> is not on
                                        the agency account: create a new one or assign a free profile.
                                    </p>
                                )}
                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="w-full sm:w-80">
                                        <Select<ProfileOption>
                                            instanceId={`assign-${account.avatarId}`}
                                            placeholder={
                                                profileOptions.length > 0
                                                    ? 'Pick a free profile'
                                                    : 'No free profiles'
                                            }
                                            isDisabled={isBusy || profileOptions.length === 0}
                                            isClearable
                                            options={profileOptions}
                                            value={selectedOption}
                                            onChange={(opt) =>
                                                setAssignSelection((prev) => ({
                                                    ...prev,
                                                    [account.avatarId]: opt?.value ?? '',
                                                }))
                                            }
                                        />
                                    </div>
                                    <Button
                                        size="sm"
                                        loading={isBusy}
                                        disabled={!selectedOption}
                                        onClick={() => handleAssign(account.avatarId)}
                                    >
                                        Assign
                                    </Button>
                                    <Button
                                        variant="solid"
                                        size="sm"
                                        loading={isBusy}
                                        disabled={!canCreate}
                                        onClick={() => handleCreateProfile(account.avatarId)}
                                    >
                                        Create profile
                                    </Button>
                                </div>
                                {agencyFull && (
                                    <p className="text-xs text-gray-400 mt-2">
                                        The agency account is full ({agency?.profilesUsed} /{' '}
                                        {agency?.limit}): free a profile or upgrade the plan.
                                    </p>
                                )}
                            </div>
                        )}

                        {isActive && (
                            <>
                                <div className="mb-3">
                                    <p className="text-sm font-semibold mb-2">Connected socials</p>
                                    {chips.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {chips.map((chip, idx) => (
                                                <Tag
                                                    key={idx}
                                                    className={`inline-flex items-center gap-1.5 ${
                                                        chip.reauthRequired ? AMBER_TAG : ''
                                                    }`}
                                                >
                                                    {chip.avatarUrl && (
                                                        <img
                                                            src={chip.avatarUrl}
                                                            alt=""
                                                            className="w-4 h-4 rounded-full object-cover"
                                                        />
                                                    )}
                                                    <span className="capitalize">{chip.platform}</span>
                                                    {chip.accountName && (
                                                        <span className="text-gray-400">
                                                            {chip.accountName}
                                                        </span>
                                                    )}
                                                    {chip.reauthRequired && (
                                                        <span className="font-semibold">re-auth</span>
                                                    )}
                                                </Tag>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-500">
                                            No socials linked yet — click &quot;Connect socials&quot;
                                            to link Instagram, X, TikTok…
                                        </p>
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        variant="solid"
                                        size="sm"
                                        disabled={isBusy}
                                        onClick={() => handleConnectSocials(account.avatarId)}
                                    >
                                        Connect socials
                                    </Button>
                                    <Button
                                        size="sm"
                                        loading={isBusy}
                                        onClick={() => handleRefresh(account.avatarId)}
                                    >
                                        Refresh
                                    </Button>
                                    <Button
                                        variant="plain"
                                        size="sm"
                                        disabled={isBusy}
                                        customColorClass={() => 'text-red-500 hover:text-red-600'}
                                        onClick={() => setConfirmUnassign(account)}
                                    >
                                        Unassign
                                    </Button>
                                </div>

                                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                                    <p className="text-sm font-semibold mb-1">AI comment replies</p>
                                    <p className="text-xs text-gray-500 mb-4">
                                        Lets the agent reply to public comments on this avatar&apos;s
                                        posts.
                                    </p>

                                    <div className="flex items-center justify-between gap-3 mb-4">
                                        <div>
                                            <label
                                                htmlFor={`replies-${account.avatarId}`}
                                                className="text-sm cursor-pointer"
                                            >
                                                Reply to comments with AI
                                            </label>
                                            <p className="text-xs text-gray-400">
                                                Turns on comment polling and replies for this
                                                avatar&apos;s connected accounts.
                                            </p>
                                        </div>
                                        <Switcher
                                            id={`replies-${account.avatarId}`}
                                            checked={profile?.aiCommentRepliesEnabled ?? false}
                                            isLoading={isFieldSaving(
                                                account.avatarId,
                                                'aiCommentRepliesEnabled',
                                            )}
                                            onChange={(checked) =>
                                                saveCommentSetting(
                                                    account,
                                                    'aiCommentRepliesEnabled',
                                                    { aiCommentRepliesEnabled: checked },
                                                )
                                            }
                                        />
                                    </div>

                                    <div className="mb-4">
                                        <label
                                            htmlFor={`chat-mode-${account.avatarId}`}
                                            className="text-sm mb-1 block"
                                        >
                                            New comment threads start as
                                        </label>
                                        <p className="text-xs text-gray-400 mb-2">
                                            Draft leaves the reply for you to approve in the Inbox.
                                            Auto sends by itself once Autopilot rules allow it.
                                            Existing threads keep their own mode.
                                        </p>
                                        <div className="w-full sm:w-72">
                                            <Select
                                                inputId={`chat-mode-${account.avatarId}`}
                                                instanceId={`chat-mode-${account.avatarId}`}
                                                isDisabled={
                                                    !profile?.aiCommentRepliesEnabled ||
                                                    isFieldSaving(
                                                        account.avatarId,
                                                        'aiCommentDefaultChatMode',
                                                    )
                                                }
                                                isLoading={isFieldSaving(
                                                    account.avatarId,
                                                    'aiCommentDefaultChatMode',
                                                )}
                                                options={CHAT_MODE_OPTIONS}
                                                value={CHAT_MODE_OPTIONS.find(
                                                    (option) =>
                                                        option.value ===
                                                        (profile?.aiCommentDefaultChatMode ?? 'draft'),
                                                )}
                                                onChange={(option) =>
                                                    option &&
                                                    saveCommentSetting(
                                                        account,
                                                        'aiCommentDefaultChatMode',
                                                        { aiCommentDefaultChatMode: option.value },
                                                    )
                                                }
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between gap-3 mb-1">
                                        <label
                                            htmlFor={`dm-enabled-${account.avatarId}`}
                                            className={`text-sm ${
                                                profile?.aiCommentDmText?.trim()
                                                    ? 'cursor-pointer'
                                                    : 'cursor-not-allowed text-gray-400'
                                            }`}
                                            title={
                                                profile?.aiCommentDmText?.trim()
                                                    ? undefined
                                                    : 'Write and save the DM text first'
                                            }
                                        >
                                            Send an Instagram DM after replying
                                        </label>
                                        <Switcher
                                            id={`dm-enabled-${account.avatarId}`}
                                            checked={profile?.aiCommentDmEnabled ?? false}
                                            disabled={
                                                !profile?.aiCommentDmEnabled &&
                                                !profile?.aiCommentDmText?.trim()
                                            }
                                            isLoading={isFieldSaving(
                                                account.avatarId,
                                                'aiCommentDmEnabled',
                                            )}
                                            onChange={(checked) => handleToggleDm(account, checked)}
                                        />
                                    </div>
                                    <p className="text-xs text-gray-400 mb-3">
                                        Instagram only. Meta allows one private reply per comment,
                                        within 7 days.
                                    </p>

                                    {profile?.aiCommentRepliesEnabled &&
                                        (() => {
                                            const dmDraft = getDmDraft(account)
                                            return (
                                                <div className="flex flex-col gap-2">
                                                    <Input
                                                        textArea
                                                        rows={2}
                                                        placeholder="DM text sent privately after the public reply"
                                                        value={dmDraft.text}
                                                        onChange={(e) =>
                                                            handleDmTextChange(account, e.target.value)
                                                        }
                                                    />
                                                    {dmDraft.buttons.map((button, index) => (
                                                        <div
                                                            key={button.id}
                                                            className="flex flex-wrap items-center gap-2"
                                                        >
                                                            <div className="w-full sm:w-40">
                                                                <Input
                                                                    size="sm"
                                                                    maxLength={20}
                                                                    placeholder="Button title"
                                                                    value={button.title}
                                                                    onChange={(e) =>
                                                                        handleDmButtonChange(
                                                                            account,
                                                                            index,
                                                                            'title',
                                                                            e.target.value,
                                                                        )
                                                                    }
                                                                />
                                                            </div>
                                                            <div className="w-full sm:w-64">
                                                                <Input
                                                                    size="sm"
                                                                    placeholder="https://…"
                                                                    value={button.url}
                                                                    onChange={(e) =>
                                                                        handleDmButtonChange(
                                                                            account,
                                                                            index,
                                                                            'url',
                                                                            e.target.value,
                                                                        )
                                                                    }
                                                                />
                                                            </div>
                                                            <Button
                                                                variant="plain"
                                                                size="sm"
                                                                customColorClass={() =>
                                                                    'text-red-500 hover:text-red-600'
                                                                }
                                                                onClick={() =>
                                                                    handleRemoveDmButton(account, index)
                                                                }
                                                            >
                                                                Remove
                                                            </Button>
                                                        </div>
                                                    ))}
                                                    {dmDraft.buttons.length < MAX_DM_BUTTONS && (
                                                        <div>
                                                            <Button
                                                                variant="plain"
                                                                size="sm"
                                                                onClick={() =>
                                                                    handleAddDmButton(account)
                                                                }
                                                            >
                                                                Add button
                                                            </Button>
                                                        </div>
                                                    )}
                                                    <div>
                                                        <Button
                                                            variant="solid"
                                                            size="sm"
                                                            loading={savingDm === account.avatarId}
                                                            onClick={() => handleSaveDm(account)}
                                                        >
                                                            Save DM
                                                        </Button>
                                                    </div>
                                                </div>
                                            )
                                        })()}
                                </div>
                            </>
                        )}
                    </Card>
                )
            })}

            <ConfirmDialog
                isOpen={!!confirmUnassign}
                type="danger"
                title={`Unassign ${confirmUnassign?.avatarName ?? ''}?`}
                confirmText="Unassign"
                confirmButtonProps={{ color: 'red' }}
                onClose={() => setConfirmUnassign(null)}
                onRequestClose={() => setConfirmUnassign(null)}
                onCancel={() => setConfirmUnassign(null)}
                onConfirm={handleUnassign}
            >
                <p>
                    The profile stays on the agency account with its linked socials and goes
                    back to the free list, so it can be assigned to another avatar. Posts
                    already scheduled on Upload-Post will still publish; the post history
                    stays with the profile. AI comment replies are switched off.
                </p>
            </ConfirmDialog>
        </div>
    )
}

export default AccountsClient
