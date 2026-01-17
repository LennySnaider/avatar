'use server'
import type { SignInCredential } from '@/@types/auth'
import { signInUserData } from '@/mock/data/authData'
import sleep from '@/utils/sleep'

const validateCredential = async (values: SignInCredential) => {
    const { email, password } = values

    await sleep(80)

    const user = signInUserData.find(
        (user) => user.email === email && user.password === password,
    )

    return user
}

export default validateCredential
