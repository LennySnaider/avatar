'use client'

import ForgotPassword from '@/components/auth/ForgotPassword'
import Split from '@/components/layouts/AuthLayout/Split'
import { apiForgotPassword } from '@/services/AuthService'
import type { OnForgotPasswordSubmitPayload } from '@/components/auth/ForgotPassword'

const ForgotPasswordDemoSplit = () => {
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
        <Split>
            <ForgotPassword
                signInUrl="/auth/sign-in-side"
                onForgotPasswordSubmit={handleForgotPasswordSubmit}
            />
        </Split>
    )
}

export default ForgotPasswordDemoSplit
