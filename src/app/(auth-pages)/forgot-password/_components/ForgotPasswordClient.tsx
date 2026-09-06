'use client'

import apiErrorMessage from '@/utils/apiErrorMessage'
import { apiForgotPassword } from '@/services/AuthService'
import ForgotPassword from '@/components/auth/ForgotPassword'
import { toast } from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import type { OnForgotPasswordSubmitPayload } from '@/components/auth/ForgotPassword'

/**
 * El toast decía "Email sent! / We have sent you an email to reset your
 * password". Eso era mentira dos veces: la ruta no enviaba nada, y aunque
 * enviara, la respuesta del servidor es DELIBERADAMENTE la misma exista o no
 * la cuenta (si no, el formulario delata qué correos están registrados; el
 * porqué largo está en la cabecera de src/app/api/auth/forgot-password).
 * Afirmar "te lo hemos enviado" contradice esa regla desde el cliente.
 *
 * Ahora el texto lo pone el SERVIDOR y aquí sólo se muestra: así no hay dos
 * redacciones que puedan discrepar, y la única que existe está escrita para
 * ser verdad en los dos casos.
 */
const ForgotPasswordClient = () => {
    const handleForgotPasswordSubmit = async ({
        values,
        setSubmitting,
        setMessage,
        setEmailSent,
    }: OnForgotPasswordSubmitPayload) => {
        try {
            setSubmitting(true)
            const res = await apiForgotPassword<{ message?: string }>(values)
            toast.push(
                <Notification title="Check your email" type="success">
                    {res?.message ??
                        'If an account exists for that email address, we have sent it a reset link.'}
                </Notification>,
            )
            setEmailSent(true)
        } catch (error) {
            // apiErrorMessage saca el `message` del cuerpo del error; sin él,
            // aquí llegaba el AxiosError entero y pintarlo reventaba el render
            // ("Objects are not valid as a React child"). Es lo que enseña el
            // 503 de "no hay proveedor de correo configurado".
            setMessage(apiErrorMessage(error))
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <ForgotPassword onForgotPasswordSubmit={handleForgotPasswordSubmit} />
    )
}

export default ForgotPasswordClient
