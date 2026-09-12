import { auth } from '@/auth'
import AuthProvider from '@/components/auth/AuthProvider'
import ThemeProvider from '@/components/template/Theme/ThemeProvider'
import pageMetaConfig from '@/configs/page-meta.config'
import LocaleProvider from '@/components/template/LocaleProvider'
import NavigationProvider from '@/components/template/Navigation/NavigationProvider'
import {
    getNavigation,
    getInstalledModules,
} from '@/server/actions/navigation/getNavigation'
import { getTheme } from '@/server/actions/theme'
import { getLocale, getMessages } from 'next-intl/server'
import type { ReactNode } from 'react'
import '@/assets/styles/app.css'

export const metadata = {
    ...pageMetaConfig,
}

export default async function RootLayout({
    children,
}: Readonly<{
    children: ReactNode
}>) {
    const session = await auth()

    const locale = await getLocale()

    const messages = await getMessages()

    // Una sola resolución de módulos instalados por render: se pasa a
    // getNavigation para podar el árbol en vez de dejar que la recalcule por
    // su cuenta (antes eran dos resoluciones de sesión + membresía en serie
    // para lo mismo).
    const installedModules = await getInstalledModules()
    const navigationTree = await getNavigation(installedModules)

    const theme = await getTheme()

    return (
        <AuthProvider session={session}>
            <html
                className={theme.mode === 'dark' ? 'dark' : 'light'}
                lang={locale}
                dir={theme.direction}
                suppressHydrationWarning
            >
                <body suppressHydrationWarning>
                    <LocaleProvider locale={locale} messages={messages}>
                        <ThemeProvider locale={locale} theme={theme}>
                            <NavigationProvider
                                navigationTree={navigationTree}
                                installedModules={installedModules}
                            >
                                {children}
                            </NavigationProvider>
                        </ThemeProvider>
                    </LocaleProvider>
                </body>
            </html>
        </AuthProvider>
    )
}
