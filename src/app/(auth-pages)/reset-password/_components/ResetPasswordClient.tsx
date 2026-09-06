'use client'

import apiErrorMessage from '@/utils/apiErrorMessage'
import ResetPassword from '@/components/auth/ResetPassword'
import { apiResetPassword } from '@/services/AuthService'
import { useSearchParams } from 'next/navigation'
import type { OnResetPasswordSubmitPayload } from '@/components/auth/ResetPassword'

/** Mismo texto que devuelve la ruta para token inválido/caducado/usado. */
const ENLACE_INVALIDO =
    'This password reset link is invalid or has expired. Please request a new one.'

const ResetPasswordClient = () => {
    const searchParams = useSearchParams()

    /** El token de la query es lo ÚNICO que autoriza el cambio. */
    const token = searchParams.get('token')

    const handleResetPassword = async (
        payload: OnResetPasswordSubmitPayload,
    ) => {
        const { values, setSubmitting, setMessage, setResetComplete } = payload

        // Antes se mandaba `token as string`: con la query vacía viajaba `null`
        // y el servidor recibía la cadena "null". El cast callaba justo donde
        // hacía falta que hablara — es un cast, no una conversión. Se corta
        // aquí y se dice lo mismo que diría el servidor.
        if (!token) {
            setMessage(ENLACE_INVALIDO)
            return
        }

        try {
            setSubmitting(true)
            await apiResetPassword({ ...values, token })
            // `setResetComplete` sólo se llama si la petición NO lanzó, o sea
            // si la contraseña se cambió de verdad. La pantalla de "Reset done"
            // es ahora una afirmación respaldada por el servidor.
            setResetComplete?.(true)
        } catch (error) {
            setMessage(apiErrorMessage(error))
        } finally {
            setSubmitting(false)
        }
    }

    return <ResetPassword onResetPasswordSubmit={handleResetPassword} />
}

export default ResetPasswordClient
