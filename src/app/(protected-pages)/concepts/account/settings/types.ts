export type View = 'profile' | 'security' | 'notification' | 'billing'

export type GetSettingsProfileResponse = {
    id: string
    name: string
    firstName: string
    lastName: string
    email: string
    img: string
    location: string
    address: string
    postcode: string
    city: string
    country: string
    dialCode: string
    birthday: string
    phoneNumber: string
}

export type GetSettingsNotificationResponse = {
    email: string[]
    desktop: boolean
    unreadMessageBadge: boolean
    notifymeAbout: string
}
