export type View = 'profile' | 'security' | 'notification' | 'billing'

export type GetSettingsNotificationResponse = {
    email: string[]
    desktop: boolean
    unreadMessageBadge: boolean
    notifymeAbout: string
}
