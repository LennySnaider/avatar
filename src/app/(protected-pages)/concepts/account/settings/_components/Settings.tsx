'use client'

import { lazy, Suspense } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import SettingsMenu from './SettingsMenu'
import SettingMobileMenu from './SettingMobileMenu'
import Loading from '@/components/shared/Loading'
import { useSettingsStore } from '../_store/settingsStore'

const Profile = lazy(() => import('./SettingsProfile'))
const Security = lazy(() => import('./SettingsSecurity'))
const Notification = lazy(() => import('./SettingsNotification'))
const Billing = lazy(() => import('./SettingsBilling'))
const Integration = lazy(() => import('./SettingIntegration'))

const Settings = () => {
    const { currentView } = useSettingsStore()

    return (
        <AdaptiveCard className="h-full">
            <div className="flex flex-auto h-full">
                <div className="w-[200px] xl:w-[280px] hidden lg:block">
                    <SettingsMenu />
                </div>
                <div className="xl:ltr:pl-6 xl:rtl:pr-6 flex-1 py-2">
                    <div className="mb-6 lg:hidden">
                        <SettingMobileMenu />
                    </div>
                    <Suspense
                        fallback={<Loading loading={true} className="w-full" />}
                    >
                        {currentView === 'profile' && <Profile />}
                        {currentView === 'security' && <Security />}
                        {currentView === 'notification' && <Notification />}
                        {currentView === 'billing' && <Billing />}
                        {currentView === 'integration' && <Integration />}
                    </Suspense>
                </div>
            </div>
        </AdaptiveCard>
    )
}

export default Settings
