'use client'

import ForgotPassword from '@/components/auth/ForgotPassword'
import Simple from '@/components/layouts/AuthLayout/Simple'
import { apiForgotPassword } from '@/services/AuthService'
import type { OnForgotPasswordSubmitPayload } from '@/components/auth/ForgotPassword'

const ForgotPasswordDemoSimple = () => {
    const handleForgotPasswordSubmit = async ({
        values,
        setSubmitting,
        setMessage,
        setEmailSent,
    }: OnForgotPasswordSubmitPayload) => {
        try {
            setSubmitting(true)
            await apiForgotPassword(values)
            setEmailSent(true)
        } catch (error) {
            setMessage(error as string)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Simple>
            <ForgotPassword
                signInUrl="/auth/sign-in-side"
                onForgotPasswordSubmit={handleForgotPasswordSubmit}
            />
        </Simple>
    )
}

export default ForgotPasswordDemoSimple
