import SignIn from '@/components/auth/SignIn'
import Split from '@/components/layouts/AuthLayout/Split'

const SignInDemoSplit = () => {
    return (
        <Split>
            <SignIn
                signUpUrl="/auth/sign-up-split"
                forgetPasswordUrl="/auth/forgot-password-split"
            />
        </Split>
    )
}

export default SignInDemoSplit
