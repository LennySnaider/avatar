'use client'

import SignIn from '@/components/auth/SignIn'
import Simple from '@/components/layouts/AuthLayout/Simple'

const SignInDemoSimple = () => {
    return (
        <Simple>
            <SignIn
                signUpUrl="/auth/sign-up-simple"
                forgetPasswordUrl="/auth/forgot-password-simple"
            />
        </Simple>
    )
}

export default SignInDemoSimple
