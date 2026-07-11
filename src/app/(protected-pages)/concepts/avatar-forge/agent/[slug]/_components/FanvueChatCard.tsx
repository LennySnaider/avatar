'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { getFanvueConnection, listFanvueCreators } from '@/services/FanvueService'
import { setAvatarFanvueCreator, syncFanvueInbox } from '@/services/AgentInboxService'

interface FanvueChatCardProps {
    avatarId: string
    initialCreatorUuid: string | null
}

interface Option {
    value: string
    label: string
}

const SELF_OPTION: Option = { value: '', label: 'My account (self)' }

const FanvueChatCard = ({ avatarId, initialCreatorUuid }: FanvueChatCardProps) => {
    const [connected, setConnected] = useState<boolean | null>(null)
    const [creators, setCreators] = useState<Option[]>([])
    const [selected, setSelected] = useState<string>(initialCreatorUuid ?? '')
    const [isSaving, setIsSaving] = useState(false)
    const [isSyncing, setIsSyncing] = useState(false)

    useEffect(() => {
        let cancelled = false
        Promise.all([getFanvueConnection(), listFanvueCreators()]).then(([conn, cr]) => {
            if (cancelled) return
            setConnected(!!(conn.success && conn.data?.connected))
            if (cr.success) {
                setCreators(
                    (cr.data ?? []).map((c) => ({
                        value: c.creator_user_uuid,
                        label: c.display_name ?? c.handle ?? c.creator_user_uuid,
                    })),
                )
            }
        })
        return () => {
            cancelled = true
        }
    }, [])

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const result = await setAvatarFanvueCreator(avatarId, selected || null)
            toast.push(
                result.success ? (
                    <Notification type="success" title="Saved">
                        Fanvue chat account linked
                    </Notification>
                ) : (
                    <Notification type="danger" title="Failed">
                        {result.error}
                    </Notification>
                ),
            )
        } finally {
            setIsSaving(false)
        }
    }

    const handleSync = async () => {
        setIsSyncing(true)
        try {
            const result = await syncFanvueInbox(avatarId)
            toast.push(
                result.success ? (
                    <Notification type="success" title="Inbox synced">
                        {result.data?.chats ?? 0} chats, {result.data?.messages ?? 0} new messages
                    </Notification>
                ) : (
                    <Notification type="danger" title="Sync failed">
                        {result.error}
                    </Notification>
                ),
            )
        } finally {
            setIsSyncing(false)
        }
    }

    const options = [SELF_OPTION, ...creators]

    return (
        <Card className="max-w-4xl mt-4">
            <p className="text-sm font-semibold mb-1">Fanvue chat</p>
            <p className="text-xs text-gray-400 mb-3">
                Which Fanvue account this avatar chats from. Replies show up in the{' '}
                <Link href="/concepts/avatar-forge/inbox" className="underline">
                    Agent Inbox
                </Link>
                .
            </p>

            {connected === false ? (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                    Fanvue isn&apos;t connected —{' '}
                    <Link href="/concepts/avatar-forge/fanvue/accounts" className="underline font-semibold">
                        connect it
                    </Link>{' '}
                    to enable chat.
                </p>
            ) : (
                <div className="flex flex-wrap items-end gap-3">
                    <div className="w-72">
                        <p className="text-xs text-gray-500 mb-1">Account</p>
                        <Select<Option>
                            instanceId="fanvue-chat-account"
                            options={options}
                            value={options.find((o) => o.value === selected) ?? SELF_OPTION}
                            isSearchable={options.length > 6}
                            onChange={(opt) => setSelected(opt?.value ?? '')}
                        />
                    </div>
                    <Button variant="solid" size="sm" loading={isSaving} onClick={handleSave}>
                        Save
                    </Button>
                    <Button size="sm" loading={isSyncing} onClick={handleSync}>
                        Sync inbox now
                    </Button>
                </div>
            )}
        </Card>
    )
}

export default FanvueChatCard
