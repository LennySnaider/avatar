import SignIn from '@/components/auth/SignIn'
import Side from '@/components/layouts/AuthLayout/Side'

const SignInDemoSplit = () => {
    return (
        <Side>
            <SignIn
                signUpUrl="/auth/sign-up-side"
                forgetPasswordUrl="/auth/forgot-password-side"
            />
        </Side>
    )
}

export default SignInDemoSplit
