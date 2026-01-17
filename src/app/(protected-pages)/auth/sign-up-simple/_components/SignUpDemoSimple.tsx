'use client'

import SignUp from '@/components/auth/SignUp'
import Simple from '@/components/layouts/AuthLayout/Simple'

const SignUpDemoSimple = () => {
    return (
        <Simple>
            <SignUp signInUrl="/auth/sign-in-simple" />
        </Simple>
    )
}

export default SignUpDemoSimple
