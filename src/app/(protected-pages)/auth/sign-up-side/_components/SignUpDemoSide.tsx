'use client'

import SignUp from '@/components/auth/SignUp'
import Side from '@/components/layouts/AuthLayout/Side'

const SignUpDemoSide = () => {
    return (
        <Side>
            <SignUp signInUrl="/auth/sign-in-side" />
        </Side>
    )
}

export default SignUpDemoSide
