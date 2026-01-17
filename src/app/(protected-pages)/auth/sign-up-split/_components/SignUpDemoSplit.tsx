'use client'

import SignUp from '@/components/auth/SignUp'
import Split from '@/components/layouts/AuthLayout/Split'

const SignUpDemoSplit = () => {
    return (
        <Split>
            <SignUp signInUrl="/auth/sign-in-split" />
        </Split>
    )
}

export default SignUpDemoSplit
