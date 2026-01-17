import { ADMIN, USER } from '@/constants/roles.constant'
import type { Routes } from '@/@types/routes'

const authDemoRoute: Routes = {
    '/auth/sign-in-simple': {
        key: 'authentication.signInSimple',
        authority: [ADMIN, USER],
        meta: {
            layout: 'blank',
            pageContainerType: 'gutterless',
            footer: false,
        },
    },
    '/auth/sign-in-side': {
        key: 'authentication.signInSide',
        authority: [ADMIN, USER],
        meta: {
            layout: 'blank',
            pageContainerType: 'gutterless',
            footer: false,
        },
    },
    '/auth/sign-in-split': {
        key: 'authentication.signInSplit',
        authority: [ADMIN, USER],
        meta: {
            layout: 'blank',
            pageContainerType: 'gutterless',
            footer: false,
        },
    },
    '/auth/sign-up-simple': {
        key: 'authentication.signUpSimple',
        authority: [ADMIN, USER],
        meta: {
            layout: 'blank',
            pageContainerType: 'gutterless',
            footer: false,
        },
    },
    '/auth/sign-up-side': {
        key: 'authentication.signUpSide',
        authority: [ADMIN, USER],
        meta: {
            layout: 'blank',
            pageContainerType: 'gutterless',
            footer: false,
        },
    },
    '/auth/sign-up-split': {
        key: 'authentication.signUpSplit',
        authority: [ADMIN, USER],
        meta: {
            layout: 'blank',
            pageContainerType: 'gutterless',
            footer: false,
        },
    },
    '/auth/reset-password-simple': {
        key: 'authentication.resetPasswordSimple',
        authority: [ADMIN, USER],
        meta: {
            layout: 'blank',
            pageContainerType: 'gutterless',
            footer: false,
        },
    },
    '/auth/reset-password-side': {
        key: 'authentication.resetPasswordSide',
        authority: [ADMIN, USER],
        meta: {
            layout: 'blank',
            pageContainerType: 'gutterless',
            footer: false,
        },
    },
    '/auth/reset-password-split': {
        key: 'authentication.resetPasswordSplit',
        authority: [ADMIN, USER],
        meta: {
            layout: 'blank',
            pageContainerType: 'gutterless',
            footer: false,
        },
    },
    '/auth/forgot-password-simple': {
        key: 'authentication.forgotPasswordSimple',
        authority: [ADMIN, USER],
        meta: {
            layout: 'blank',
            pageContainerType: 'gutterless',
            footer: false,
        },
    },
    '/auth/forgot-password-side': {
        key: 'authentication.forgotPasswordSide',
        authority: [ADMIN, USER],
        meta: {
            layout: 'blank',
            pageContainerType: 'gutterless',
            footer: false,
        },
    },
    '/auth/forgot-password-split': {
        key: 'authentication.forgotPasswordSplit',
        authority: [ADMIN, USER],
        meta: {
            layout: 'blank',
            pageContainerType: 'gutterless',
            footer: false,
        },
    },
    '/auth/otp-verification-simple': {
        key: 'authentication.otpVerificationSimple',
        authority: [ADMIN, USER],
        meta: {
            layout: 'blank',
            pageContainerType: 'gutterless',
            footer: false,
        },
    },
    '/auth/otp-verification-side': {
        key: 'authentication.otpVerificationSide',
        authority: [ADMIN, USER],
        meta: {
            layout: 'blank',
            pageContainerType: 'gutterless',
            footer: false,
        },
    },
    '/auth/otp-verification-split': {
        key: 'authentication.otpVerificationSplit',
        authority: [ADMIN, USER],
        meta: {
            layout: 'blank',
            pageContainerType: 'gutterless',
            footer: false,
        },
    },
}

export default authDemoRoute
