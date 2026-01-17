'use client'

import Header from '@/components/template/Header'
import SidePanel from '@/components/template/SidePanel'
import UserProfileDropdown from '@/components//template/UserProfileDropdown'
import LanguageSelector from '@/components/template/LanguageSelector'
import Notification from '@/components/template/Notification'
import HeaderLogo from '@/components/template/HeaderLogo'
import Search from '@/components/template/Search'
import MobileNav from '@/components/template/MobileNav'
import HorizontalNav from '@/components/template/HorizontalNav'
import LayoutBase from '@/components//template/LayoutBase'
import ClientOnly from '@/components/shared/ClientOnly'
import { LAYOUT_TOP_BAR_CLASSIC } from '@/constants/theme.constant'
import type { CommonProps } from '@/@types/common'

const TopBarClassic = ({ children }: CommonProps) => {
    return (
        <LayoutBase
            type={LAYOUT_TOP_BAR_CLASSIC}
            className="app-layout-top-bar-classic flex flex-auto flex-col min-h-screen"
        >
            <div className="flex flex-auto min-w-0">
                <div className="flex flex-col flex-auto min-h-screen min-w-0 relative w-full">
                    <Header
                        container
                        className="shadow-sm dark:shadow-2xl"
                        headerStart={
                            <>
                                <MobileNav />
                                <HeaderLogo />
                            </>
                        }
                        headerMiddle={<HorizontalNav />}
                        headerEnd={
                            <ClientOnly>
                                <Search />
                                <LanguageSelector />
                                <Notification />
                                <SidePanel />
                                <UserProfileDropdown hoverable={false} />
                            </ClientOnly>
                        }
                    />
                    {children}
                </div>
            </div>
        </LayoutBase>
    )
}

export default TopBarClassic
