'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { Form, FormItem } from '@/components/ui/Form'
import PasswordInput from '@/components/shared/PasswordInput'
import ActionLink from '@/components/shared/ActionLink'
import useCurrentSession from '@/utils/hooks/useCurrentSession'
import apiErrorMessage from '@/utils/apiErrorMessage'
import {
    apiAcceptInvitation,
    apiInvitationPreview,
} from '@/services/AuthService'
import { onSignInWithCredentials } from '@/server/actions/auth/handleSignIn'
import handleSignOut from '@/server/actions/auth/handleSignOut'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/passwordPolicy'
import { ROLE_LABEL } from '@/lib/org/guards'
import type { OrgRole } from '@/lib/org/permissions'
import type { InvitationPreview } from '@/@types/auth'

/** Mismo texto que devuelve la ruta para inexistente, caducada, revocada o usada. */
const ENLACE_INVALIDO =
    'Esta invitación no es válida o ha caducado. Pide un enlace nuevo a quien te invitó.'

type FormValues = {
    name: string
    password: string
    confirmPassword: string
}

const schema = z
    .object({
        name: z.string().max(80, 'Demasiado largo'),
        password: z
            .string()
            .min(
                MIN_PASSWORD_LENGTH,
                `Al menos ${MIN_PASSWORD_LENGTH} caracteres`,
            ),
        confirmPassword: z.string().min(1, 'Confirma la contraseña'),
    })
    .refine((d) => d.password === d.confirmPassword, {
        message: 'Las contraseñas no coinciden',
        path: ['confirmPassword'],
    })

const AcceptInviteClient = () => {
    const searchParams = useSearchParams()
    /** El token de la query es lo ÚNICO que autoriza. */
    const token = searchParams.get('token')

    const { session } = useCurrentSession()
    const sessionUser = (
        session as { user?: { id?: string; email?: string | null } } | null
    )?.user
    const yaConSesion = Boolean(sessionUser?.id)

    const [preview, setPreview] = useState<InvitationPreview | null>(null)
    const [loading, setLoading] = useState(true)
    const [invalid, setInvalid] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    const {
        handleSubmit,
        control,
        formState: { errors },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { name: '', password: '', confirmPassword: '' },
    })

    useEffect(() => {
        let cancelled = false
        if (!token) {
            setInvalid(ENLACE_INVALIDO)
            setLoading(false)
            return
        }
        apiInvitationPreview(token)
            .then((p) => {
                if (!cancelled) setPreview(p)
            })
            .catch((e) => {
                if (!cancelled)
                    setInvalid(apiErrorMessage(e) || ENLACE_INVALIDO)
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [token])

    const onSubmit = async (values: FormValues) => {
        if (!token || !preview) return
        setSubmitting(true)
        setMessage(null)
        try {
            const res = await apiAcceptInvitation({
                token,
                name: values.name || undefined,
                password: values.password,
                confirmPassword: values.confirmPassword,
            })
            // La cuenta ya existe y la contraseña está en memoria: se entra
            // directo, sin pasar por /sign-in. Si el auto-login fallara, la
            // cuenta sigue creada y el enlace a sign-in está abajo.
            const signIn = await onSignInWithCredentials({
                email: res.email,
                password: values.password,
            })
            if (signIn?.error) {
                setMessage(
                    `${res.message} No se pudo iniciar sesión automáticamente: entra con tu email y tu contraseña.`,
                )
            }
        } catch (e) {
            setMessage(
                apiErrorMessage(e) || 'No se pudo completar la invitación.',
            )
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) {
        return (
            <div className="mb-6">
                <h3 className="mb-1">Comprobando la invitación…</h3>
            </div>
        )
    }

    if (invalid || !preview) {
        return (
            <div>
                <div className="mb-6">
                    <h3 className="mb-1">Invitación no válida</h3>
                </div>
                <Alert showIcon type="danger" className="mb-4">
                    {invalid ?? ENLACE_INVALIDO}
                </Alert>
                <div className="mt-4 text-center">
                    <ActionLink
                        href="/sign-in"
                        className="heading-text font-bold"
                        themeColor={false}
                    >
                        Ir a iniciar sesión
                    </ActionLink>
                </div>
            </div>
        )
    }

    if (yaConSesion) {
        return (
            <div>
                <div className="mb-6">
                    <h3 className="mb-1">Ya tienes una sesión abierta</h3>
                    <p className="font-semibold heading-text">
                        Esta invitación es para <b>{preview.email}</b>.
                    </p>
                </div>
                <Alert showIcon type="warning" className="mb-4">
                    Has iniciado sesión como{' '}
                    {sessionUser?.email ?? 'otra cuenta'}. Cierra sesión y
                    vuelve a abrir este enlace para aceptar la invitación con la
                    cuenta nueva.
                </Alert>
                <Button
                    block
                    variant="solid"
                    type="button"
                    onClick={() => handleSignOut()}
                >
                    Cerrar sesión
                </Button>
            </div>
        )
    }

    const rol = ROLE_LABEL[preview.role as OrgRole] ?? preview.role

    return (
        <div>
            <div className="mb-6">
                <h3 className="mb-1">
                    Te han invitado a {preview.organizationName}
                </h3>
                <p className="font-semibold heading-text">
                    Entrarás como <b>{rol}</b>. Elige una contraseña para crear
                    tu cuenta.
                </p>
            </div>
            {message && (
                <Alert showIcon type="danger" className="mb-4">
                    <span className="break-all">{message}</span>
                </Alert>
            )}
            <Form onSubmit={handleSubmit(onSubmit)}>
                {/*
                    El email viene del token y NO es editable: si lo fuera,
                    sería el agujero que documenta reset-password (registrarse
                    como quien quieras dentro de una organización ajena).
                */}
                <FormItem label="Email">
                    <Input value={preview.email} disabled autoComplete="off" />
                </FormItem>
                <FormItem
                    label="Tu nombre (opcional)"
                    invalid={Boolean(errors.name)}
                    errorMessage={errors.name?.message}
                >
                    <Controller
                        name="name"
                        control={control}
                        render={({ field }) => (
                            <Input
                                autoComplete="name"
                                placeholder="Como quieres aparecer"
                                {...field}
                            />
                        )}
                    />
                </FormItem>
                <FormItem
                    label="Contraseña"
                    invalid={Boolean(errors.password)}
                    errorMessage={errors.password?.message}
                >
                    <Controller
                        name="password"
                        control={control}
                        render={({ field }) => (
                            <PasswordInput
                                autoComplete="new-password"
                                placeholder="••••••••••••"
                                {...field}
                            />
                        )}
                    />
                </FormItem>
                <FormItem
                    label="Confirmar contraseña"
                    invalid={Boolean(errors.confirmPassword)}
                    errorMessage={errors.confirmPassword?.message}
                >
                    <Controller
                        name="confirmPassword"
                        control={control}
                        render={({ field }) => (
                            <PasswordInput
                                autoComplete="new-password"
                                placeholder="Repite la contraseña"
                                {...field}
                            />
                        )}
                    />
                </FormItem>
                <Button
                    block
                    loading={submitting}
                    variant="solid"
                    type="submit"
                >
                    {submitting
                        ? 'Creando tu cuenta…'
                        : 'Aceptar la invitación'}
                </Button>
            </Form>
            <p className="mt-4 text-xs text-gray-500">
                También puedes entrar con Google usando este mismo email: la
                invitación se aplica sola y entras directamente en la
                organización.
            </p>
            <div className="mt-4 text-center">
                <span>¿Ya tienes cuenta? </span>
                <ActionLink
                    href="/sign-in"
                    className="heading-text font-bold"
                    themeColor={false}
                >
                    Iniciar sesión
                </ActionLink>
            </div>
        </div>
    )
}

export default AcceptInviteClient
