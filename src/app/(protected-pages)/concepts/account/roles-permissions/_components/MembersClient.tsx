'use client'

import { useState, useTransition } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Alert from '@/components/ui/Alert'
import Tag from '@/components/ui/Tag'
import Avatar from '@/components/ui/Avatar'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Progress from '@/components/ui/Progress'
import { FormItem } from '@/components/ui/Form'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import {
    changeMemberRole,
    inviteMember,
    listTeam,
    reissueInvitationLink,
    removeMember,
    revokeInvitation,
    type InvitationListItem,
    type IssuedInvitation,
    type TeamOverview,
} from '@/services/OrgMembersService'
import type { OrgMemberRow } from '@/lib/org/membersDb'
import { ROLE_LABEL } from '@/lib/org/guards'
import { ORG_ROLES, type OrgRole } from '@/lib/org/permissions'
import { INVITABLE_ROLES, ROLE_DESCRIPTION } from '@/lib/org/memberRules'
import { canInviteMore, formatSeatUsage } from '@/lib/org/seats'
import { buildInviteUrl } from '@/lib/org/invitations'

/**
 * La pantalla de miembros.
 *
 * `canManage` VIENE DEL SERVIDOR dentro de `TeamOverview` y la pantalla nunca
 * lo deduce del rol por su cuenta: aquí sólo apaga botones y explica por qué,
 * y cada server action vuelve a comprobar el permiso. La UI es cortesía, no
 * autorización — mismo patrón que ModulesClient.
 *
 * Tras cada acción se vuelve a llamar `listTeam()`: este componente se pinta
 * por estado, no por navegación, y el `revalidatePath` del servicio no
 * refresca lo que ya está en memoria. Sin esto, el síntoma es "expulso a
 * alguien y sigue en la lista".
 */

type RoleOption = { value: OrgRole; label: string }

const roleOptions = (roles: readonly OrgRole[]): RoleOption[] =>
    roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))

const ROLE_TAG: Record<OrgRole, string> = {
    owner: 'bg-indigo-100 text-indigo-700',
    admin: 'bg-emerald-100 text-emerald-700',
    operator: 'bg-gray-100 text-gray-700',
}

const fecha = (iso: string) =>
    new Date(iso).toLocaleDateString('es', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    })

interface Props {
    initial: TeamOverview
}

export default function MembersClient({ initial }: Props) {
    const [team, setTeam] = useState<TeamOverview>(initial)
    const [pending, startTransition] = useTransition()

    // Diálogos
    const [inviteOpen, setInviteOpen] = useState(false)
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteRole, setInviteRole] = useState<OrgRole>('operator')
    const [issued, setIssued] = useState<
        (IssuedInvitation & { url: string }) | null
    >(null)
    const [roleTarget, setRoleTarget] = useState<OrgMemberRow | null>(null)
    const [nextRole, setNextRole] = useState<OrgRole>('operator')
    const [removeTarget, setRemoveTarget] = useState<OrgMemberRow | null>(null)
    const [revokeTarget, setRevokeTarget] = useState<InvitationListItem | null>(
        null,
    )

    const { canManage, seats, members, invitations, viewerUserId } = team
    const room = canInviteMore(seats)

    const notify = (type: 'success' | 'danger', message: string) => {
        toast.push(<Notification type={type}>{message}</Notification>)
    }

    const reload = async () => {
        const res = await listTeam()
        if (res.success && res.data) setTeam(res.data)
    }

    const run = <T,>(
        action: () => Promise<{ success: boolean; data?: T; error?: string }>,
        okMessage: string,
        after?: (data: T) => void,
    ) => {
        startTransition(async () => {
            const res = await action()
            if (res.success) {
                notify('success', okMessage)
                await reload()
                if (after && res.data !== undefined) after(res.data)
            } else {
                notify('danger', res.error ?? 'No se pudo completar la acción.')
            }
        })
    }

    /** El enlace se construye en el navegador: el origen correcto es el que se está mirando. */
    const showIssued = (data: IssuedInvitation) => {
        setIssued({
            ...data,
            url: buildInviteUrl(window.location.origin, data.token),
        })
    }

    const copyIssued = async () => {
        if (!issued) return
        await navigator.clipboard.writeText(issued.url)
        notify('success', 'Enlace copiado.')
    }

    const submitInvite = () => {
        const email = inviteEmail
        const role = inviteRole
        run(
            () => inviteMember({ email, role }),
            'Invitación creada.',
            (data: IssuedInvitation) => {
                setInviteOpen(false)
                setInviteEmail('')
                showIssued(data)
            },
        )
    }

    const percent =
        seats.max !== null && seats.max > 0
            ? Math.min(100, Math.round((seats.used / seats.max) * 100))
            : 0

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between gap-4">
                <h3>Miembros</h3>
                <Button
                    variant="solid"
                    disabled={!canManage || seats.isFull || pending}
                    onClick={() => setInviteOpen(true)}
                >
                    Invitar
                </Button>
            </div>

            {/* ── Asientos ─────────────────────────────────────────────── */}
            <Card>
                <h5>{formatSeatUsage(seats)}</h5>
                <p className="mt-1">
                    {seats.members === 1
                        ? '1 miembro'
                        : `${seats.members} miembros`}
                    {seats.pendingInvitations > 0 &&
                        ` y ${seats.pendingInvitations === 1 ? '1 invitación pendiente' : `${seats.pendingInvitations} invitaciones pendientes`}`}
                    {seats.planSlug && ` · plan ${seats.planSlug}`}
                </p>
                {seats.max !== null && (
                    <div className="mt-3">
                        <Progress percent={percent} size="sm" />
                    </div>
                )}
                {seats.planUnknown && (
                    <Alert type="info" showIcon className="mt-4">
                        Esta organización no tiene plan asignado: los asientos
                        no están limitados.
                    </Alert>
                )}
                {!room.ok && (
                    <Alert type="warning" showIcon className="mt-4">
                        {room.reason}
                    </Alert>
                )}
            </Card>

            {/* ── Miembros ─────────────────────────────────────────────── */}
            <Card>
                <h5 className="mb-4">Quién está en la organización</h5>
                <div className="flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
                    {members.map((m) => {
                        const esYo = m.userId === viewerUserId
                        const nombre = m.name || m.email || m.userId
                        return (
                            <div
                                key={m.userId}
                                className="flex flex-wrap items-center justify-between gap-3 py-3"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <Avatar
                                        size={40}
                                        shape="circle"
                                        src={m.image ?? undefined}
                                    >
                                        {nombre.charAt(0).toUpperCase()}
                                    </Avatar>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold heading-text truncate">
                                                {nombre}
                                            </span>
                                            <Tag className={ROLE_TAG[m.role]}>
                                                {ROLE_LABEL[m.role]}
                                            </Tag>
                                            {esYo && (
                                                <Tag className="bg-amber-100 text-amber-700">
                                                    Tú
                                                </Tag>
                                            )}
                                        </div>
                                        {m.email && m.name && (
                                            <div className="text-xs text-gray-500 truncate">
                                                {m.email}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        disabled={!canManage || pending}
                                        onClick={() => {
                                            setRoleTarget(m)
                                            setNextRole(m.role)
                                        }}
                                    >
                                        Cambiar rol
                                    </Button>
                                    {/* Autoexpulsarse está prohibido por regla: no se ofrece un botón muerto. */}
                                    {!esYo && (
                                        <Button
                                            size="sm"
                                            variant="plain"
                                            disabled={!canManage || pending}
                                            onClick={() => setRemoveTarget(m)}
                                        >
                                            Expulsar
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
                {!canManage && (
                    <p className="mt-4">
                        Sólo el propietario puede gestionar los miembros.
                    </p>
                )}
            </Card>

            {/* ── Invitaciones ─────────────────────────────────────────── */}
            <Card>
                <h5 className="mb-4">Invitaciones</h5>
                {invitations.length === 0 ? (
                    <p>No hay invitaciones pendientes.</p>
                ) : (
                    <div className="flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
                        {invitations.map((inv) => (
                            <div
                                key={inv.id}
                                className="flex flex-wrap items-center justify-between gap-3 py-3"
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold heading-text truncate">
                                            {inv.email}
                                        </span>
                                        <Tag className={ROLE_TAG[inv.role]}>
                                            {ROLE_LABEL[inv.role]}
                                        </Tag>
                                        {inv.status === 'expired' ? (
                                            <Tag className="bg-red-100 text-red-700">
                                                Caducada
                                            </Tag>
                                        ) : (
                                            <Tag className="bg-amber-100 text-amber-700">
                                                Pendiente
                                            </Tag>
                                        )}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {inv.status === 'expired'
                                            ? 'Caducó'
                                            : 'Caduca'}{' '}
                                        el {fecha(inv.expiresAt)}
                                        {inv.linkIssuedCount > 1 &&
                                            ` · enlace generado ${inv.linkIssuedCount} veces`}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        disabled={!canManage || pending}
                                        onClick={() =>
                                            run(
                                                () =>
                                                    reissueInvitationLink(
                                                        inv.id,
                                                    ),
                                                'Enlace nuevo generado.',
                                                showIssued,
                                            )
                                        }
                                    >
                                        Generar enlace nuevo
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="plain"
                                        disabled={!canManage || pending}
                                        onClick={() => setRevokeTarget(inv)}
                                    >
                                        Revocar
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* ── Diálogo: invitar ─────────────────────────────────────── */}
            <Dialog
                isOpen={inviteOpen}
                onClose={() => setInviteOpen(false)}
                onRequestClose={() => setInviteOpen(false)}
            >
                <h4 className="mb-4">Invitar a alguien</h4>
                <FormItem label="Email">
                    <Input
                        type="email"
                        placeholder="persona@empresa.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                    />
                </FormItem>
                <FormItem label="Rol">
                    <Select<RoleOption>
                        instanceId="invite-role"
                        options={roleOptions(INVITABLE_ROLES)}
                        value={roleOptions(INVITABLE_ROLES).find(
                            (o) => o.value === inviteRole,
                        )}
                        onChange={(opt) =>
                            setInviteRole(opt?.value ?? 'operator')
                        }
                    />
                    <p className="mt-2 text-xs text-gray-500">
                        {ROLE_DESCRIPTION[inviteRole]}
                    </p>
                </FormItem>
                <p className="text-xs text-gray-500 mb-4">
                    Se generará un enlace para copiar y enviar. La persona lo
                    abre, elige su contraseña y entra directamente en esta
                    organización.
                </p>
                <div className="flex justify-end gap-2">
                    <Button
                        variant="plain"
                        onClick={() => setInviteOpen(false)}
                    >
                        Cancelar
                    </Button>
                    <Button
                        variant="solid"
                        loading={pending}
                        onClick={submitInvite}
                    >
                        Crear invitación
                    </Button>
                </div>
            </Dialog>

            {/* ── Diálogo: copiar el enlace (la única vez que se muestra) ── */}
            <Dialog
                isOpen={Boolean(issued)}
                onClose={() => setIssued(null)}
                onRequestClose={() => setIssued(null)}
            >
                <h4 className="mb-2">Invitación para {issued?.email}</h4>
                <p className="mb-4">
                    Copia este enlace y envíaselo.{' '}
                    <b>Es la única vez que se muestra</b>: si lo pierdes, usa
                    «Generar enlace nuevo».
                    {issued && ` Caduca el ${fecha(issued.expiresAt)}.`}
                </p>
                <Input
                    readOnly
                    value={issued?.url ?? ''}
                    suffix={
                        <Button size="xs" variant="solid" onClick={copyIssued}>
                            Copiar
                        </Button>
                    }
                />
                <div className="mt-4 flex justify-end">
                    <Button variant="solid" onClick={() => setIssued(null)}>
                        Cerrar
                    </Button>
                </div>
            </Dialog>

            {/* ── Diálogo: cambiar rol ─────────────────────────────────── */}
            <Dialog
                isOpen={Boolean(roleTarget)}
                onClose={() => setRoleTarget(null)}
                onRequestClose={() => setRoleTarget(null)}
            >
                <h4 className="mb-4">
                    Rol de{' '}
                    {roleTarget?.name || roleTarget?.email || 'este miembro'}
                </h4>
                <FormItem label="Nuevo rol">
                    <Select<RoleOption>
                        instanceId="member-role"
                        options={roleOptions(ORG_ROLES)}
                        value={roleOptions(ORG_ROLES).find(
                            (o) => o.value === nextRole,
                        )}
                        onChange={(opt) =>
                            setNextRole(opt?.value ?? 'operator')
                        }
                    />
                    <p className="mt-2 text-xs text-gray-500">
                        {ROLE_DESCRIPTION[nextRole]}
                    </p>
                </FormItem>
                <p className="text-xs text-gray-500 mb-4">
                    Para transferir la propiedad: nombra propietario a otro
                    miembro y después cámbiate tú a administrador. La
                    organización nunca puede quedarse sin propietario.
                </p>
                <div className="flex justify-end gap-2">
                    <Button variant="plain" onClick={() => setRoleTarget(null)}>
                        Cancelar
                    </Button>
                    <Button
                        variant="solid"
                        loading={pending}
                        onClick={() => {
                            const target = roleTarget
                            setRoleTarget(null)
                            if (target) {
                                run(
                                    () =>
                                        changeMemberRole(
                                            target.userId,
                                            nextRole,
                                        ),
                                    'Rol actualizado.',
                                )
                            }
                        }}
                    >
                        Guardar
                    </Button>
                </div>
            </Dialog>

            {/* ── Confirmar: expulsar ──────────────────────────────────── */}
            <ConfirmDialog
                isOpen={Boolean(removeTarget)}
                type="danger"
                title={`Expulsar a ${removeTarget?.name || removeTarget?.email || 'este miembro'}`}
                confirmButtonProps={{ loading: pending }}
                onClose={() => setRemoveTarget(null)}
                onRequestClose={() => setRemoveTarget(null)}
                onCancel={() => setRemoveTarget(null)}
                onConfirm={() => {
                    const target = removeTarget
                    setRemoveTarget(null)
                    if (target)
                        run(
                            () => removeMember(target.userId),
                            'Miembro expulsado.',
                        )
                }}
            >
                <p>
                    Dejará de tener acceso a esta organización. Sus avatares y
                    su contenido se quedan aquí: son de la organización, no
                    suyos.
                </p>
            </ConfirmDialog>

            {/* ── Confirmar: revocar invitación ────────────────────────── */}
            <ConfirmDialog
                isOpen={Boolean(revokeTarget)}
                type="danger"
                title={`Revocar la invitación de ${revokeTarget?.email ?? ''}`}
                confirmButtonProps={{ loading: pending }}
                onClose={() => setRevokeTarget(null)}
                onRequestClose={() => setRevokeTarget(null)}
                onCancel={() => setRevokeTarget(null)}
                onConfirm={() => {
                    const target = revokeTarget
                    setRevokeTarget(null)
                    if (target)
                        run(
                            () => revokeInvitation(target.id),
                            'Invitación revocada.',
                        )
                }}
            >
                <p>
                    El enlace dejará de funcionar y el asiento queda libre al
                    instante.
                </p>
            </ConfirmDialog>
        </div>
    )
}
