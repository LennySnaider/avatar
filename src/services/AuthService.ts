import ApiService from './ApiService'

import type {
    SignUpCredential,
    ForgotPassword,
    ResetPassword,
    SignUpResponse,
    InvitationPreview,
    AcceptInvitation,
    AcceptInvitationResponse,
} from '@/@types/auth'

export async function apiSignUp(data: SignUpCredential) {
    return ApiService.fetchDataWithAxios<SignUpResponse>({
        url: '/auth/sign-up',
        method: 'post',
        data,
    })
}

export async function apiForgotPassword<T>(data: ForgotPassword) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/auth/forgot-password',
        method: 'post',
        data,
    })
}

export async function apiResetPassword<T>(data: ResetPassword) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/auth/reset-password',
        method: 'post',
        data,
    })
}

/** A quién invita el enlace y a qué. 400 con mensaje genérico si no vale. */
export async function apiInvitationPreview(token: string) {
    return ApiService.fetchDataWithAxios<InvitationPreview>({
        url: '/auth/accept-invite',
        method: 'get',
        params: { token },
    })
}

/** Crea la cuenta y la membresía en la organización que invita. */
export async function apiAcceptInvitation(data: AcceptInvitation) {
    return ApiService.fetchDataWithAxios<AcceptInvitationResponse>({
        url: '/auth/accept-invite',
        method: 'post',
        data,
    })
}
