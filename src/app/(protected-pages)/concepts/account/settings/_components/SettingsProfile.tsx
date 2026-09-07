'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Input from '@/components/ui/Input'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import { toast } from '@/components/ui/toast'
import { Form, FormItem } from '@/components/ui/Form'
import Loading from '@/components/shared/Loading'
import getProfile from '@/server/actions/user/getProfile'
import updateProfileName from '@/server/actions/user/updateProfileName'
import { MAX_DISPLAY_NAME_LENGTH } from '@/lib/auth/profileName'
import useSWR from 'swr'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'

type ProfileSchema = {
    name: string
}

/**
 * El limite se importa de `@/lib/auth/profileName`, la MISMA constante que
 * aplica el servidor. La fuente de verdad es la server action (es alcanzable
 * sin pasar por este formulario), pero si el cliente no lo exigiera el usuario
 * escribiria 300 caracteres, pulsaria Save y SOLO entonces veria el rechazo.
 * Mismo numero en los dos lados = el error aparece donde se escribe.
 */
const validationSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, { message: 'Please enter your name' })
        .max(MAX_DISPLAY_NAME_LENGTH, {
            message: `Your name must be at most ${MAX_DISPLAY_NAME_LENGTH} characters long`,
        }),
})

/**
 * "Personal information" — de maqueta a real, y sólo el NOMBRE.
 *
 * DE DONDE VIENE: este formulario fingia guardar. `onSubmit` hacia un
 * `sleep(500)` y luego `mutate({ ...data, ...values }, false)`; ese `false` es
 * el que hacia el daño, porque le dice a SWR que actualice la cache SIN
 * revalidar contra el servidor: el boton salia del estado de carga, los campos
 * se quedaban con los valores nuevos y todo parecia guardado. Al recargar
 * volvia lo de antes, porque `/api/setting/profile` era GET-only sobre
 * `profileData` de `src/mock`. Y lo que enseñaba tampoco era tu perfil, sino el
 * del maquetado. Ayer se dejó en sólo lectura; hoy el nombre se guarda de
 * verdad.
 *
 * POR QUE SOLO EL NOMBRE (la frontera, con su motivo cada una):
 *
 *  - `email` se queda VISIBLE pero no editable. Es la credencial de acceso:
 *    cambiarla sin verificar la direccion nueva deja al usuario fuera de su
 *    propia cuenta a la primera errata, y verificar exige un proveedor de
 *    correo que hoy no existe. El aviso dice eso, no un "proximamente" vacio.
 *  - Telefono, direccion, ciudad, pais y codigo de pais NO vuelven: la tabla
 *    `users` no tiene esas columnas. Enseñar un campo editable que no se
 *    persiste es volver a mentir, sólo que mas discretamente.
 *  - La foto de perfil tampoco: `image` si existe en la tabla, pero subirla
 *    exige decidir donde viven las fotos, y el bucket `avatars` es de las
 *    referencias del producto. Fuera de alcance a proposito. (El "Upload image"
 *    original creaba un `URL.createObjectURL` que moria con la pestaña.)
 *
 * LA SESION: el nombre que pintan la cabecera, el menu de usuario y el SideNav
 * sale del JWT, no de la base. Guardar y no hacer nada mas dejaria al usuario
 * viendo "Saved" con su nombre viejo en la esquina hasta el siguiente login.
 * Se resuelve abajo, en `handleSubmit`.
 */
const SettingsProfile = () => {
    const [isSubmitting, setIsSubmitting] = useState(false)

    const router = useRouter()
    const { update: updateSession } = useSession()

    const {
        data: result,
        isLoading,
        mutate,
    } = useSWR('settings-profile', () => getProfile(), {
        revalidateOnFocus: false,
        revalidateIfStale: false,
        revalidateOnReconnect: false,
    })

    const {
        handleSubmit,
        reset,
        formState: { errors },
        control,
    } = useForm<ProfileSchema>({
        resolver: zodResolver(validationSchema),
        defaultValues: { name: '' },
    })

    useEffect(() => {
        if (result?.success && result.profile) {
            reset({ name: result.profile.name })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result])

    // El email y el error de carga se derivan del resultado de la accion. Se
    // declaran ANTES de `onSubmit` porque este los usa: dejarlos debajo
    // funcionaba por como cierra el closure, pero invita a romperlo.
    const email = result?.success ? (result.profile?.email ?? '') : ''
    const loadError = result && !result.success ? result.message : null

    const onSubmit = async (values: ProfileSchema) => {
        setIsSubmitting(true)
        try {
            // Sólo viaja el nombre: el id del usuario lo pone el servidor desde
            // la sesion. Mandarlo desde aqui convertiria esta accion en
            // "renombra a quien yo diga".
            const response = await updateProfileName({ name: values.name })

            if (response.success) {
                // El servidor devuelve el nombre ya normalizado (espacios
                // colapsados, recortado). Se repinta con ESE valor y no con lo
                // tecleado: si no, el campo enseñaria una cosa y la base tendria
                // otra — en pequeño, el mismo bug que se está arreglando.
                const savedName = response.name ?? values.name
                reset({ name: savedName })
                mutate(
                    { success: true, profile: { name: savedName, email } },
                    false,
                )

                /**
                 * Refresco de la sesion, en dos pasos y en este orden:
                 *
                 *  1. `updateSession()` dispara `trigger === 'update'` en el
                 *     callback `jwt` (src/auth.ts), que RELEE el nombre de la
                 *     base y reemite la cookie del token. No se le pasa el
                 *     nombre a proposito: lo que mande el cliente aqui no es de
                 *     fiar, y el servidor ya sabe leerlo.
                 *  2. `router.refresh()` porque con el paso 1 NO basta. La
                 *     cabecera y el menu de usuario no leen `useSession()`:
                 *     leen `useCurrentSession()`, un contexto propio de la
                 *     plantilla cuyo valor lo fija el layout raiz (server
                 *     component) de una sola vez. Ese contexto no se entera de
                 *     nada hasta que el layout se vuelve a renderizar en
                 *     servidor — que es justo lo que hace `router.refresh()`,
                 *     ya con la cookie nueva del paso 1.
                 */
                await updateSession()
                router.refresh()

                toast.push(
                    <Notification title="Profile updated" type="success">
                        {response.message}
                    </Notification>,
                    { placement: 'top-center' },
                )
            } else {
                toast.push(
                    <Notification
                        title="Could not update profile"
                        type="danger"
                    >
                        {response.message}
                    </Notification>,
                    { placement: 'top-center' },
                )
            }
        } catch (error) {
            // Fallo de transporte / excepcion no controlada de la accion. No se
            // enseña el error crudo: puede llevar detalle de infraestructura.
            console.error('updateProfileName failed:', error)
            toast.push(
                <Notification title="Could not update profile" type="danger">
                    Something went wrong. Please try again.
                </Notification>,
                { placement: 'top-center' },
            )
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <>
            <h4 className="mb-4">Personal information</h4>
            {loadError && (
                <Alert showIcon type="danger" className="mb-6">
                    {loadError}
                </Alert>
            )}
            <Alert showIcon type="info" className="mb-6">
                Your name is the only detail you can change here. Your email
                address is the credential you sign in with, and changing it
                safely requires verifying the new address first — that needs an
                email provider this app does not have connected yet, so it stays
                read-only until then.
            </Alert>
            <Loading loading={isLoading}>
                <Form onSubmit={handleSubmit(onSubmit)}>
                    <FormItem
                        label="Name"
                        invalid={Boolean(errors.name)}
                        errorMessage={errors.name?.message}
                    >
                        <Controller
                            name="name"
                            control={control}
                            render={({ field }) => (
                                <Input
                                    type="text"
                                    autoComplete="off"
                                    placeholder="Your name"
                                    maxLength={MAX_DISPLAY_NAME_LENGTH}
                                    disabled={Boolean(loadError)}
                                    {...field}
                                />
                            )}
                        />
                    </FormItem>
                    <FormItem label="Email">
                        {/*
                            Fuera del `Controller` a proposito: no es un campo
                            del formulario, es un dato que se enseña. Si viviera
                            en el form, un `disabled` de mas o de menos lo
                            convertiria en editable sin que nada mas cambie.
                        */}
                        <Input
                            type="email"
                            autoComplete="off"
                            value={email}
                            readOnly
                            disabled
                        />
                    </FormItem>
                    <div className="flex justify-end">
                        <Button
                            variant="solid"
                            type="submit"
                            loading={isSubmitting}
                            disabled={Boolean(loadError)}
                        >
                            Save
                        </Button>
                    </div>
                </Form>
            </Loading>
        </>
    )
}

export default SettingsProfile
