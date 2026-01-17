'use client'

import { useState } from 'react'
import classNames from '@/utils/classNames'
import useResponsive from '@/utils/hooks/useResponsive'
import { Link } from 'react-scroll'
import NextLink from 'next/link'

type AnchorTab = {
    title: string
    value: string
    to: string
}

type LinkTab = {
    title: string
    value: string
    href: string
}

type Tab = LinkTab | AnchorTab

const NavList = ({
    tabs: propTabs,
    tabClassName,
    onTabClick,
}: {
    tabs: Tab[]
    tabClassName?: string
    onTabClick?: () => void
}) => {
    const [active, setActive] = useState<Tab>(propTabs[0])
    const [show, setShow] = useState(false)
    
    const { larger } = useResponsive()

    const moveSelectedTabToTop = (idx: number) => {
        setShow(true)
        const newTabs = [...propTabs]
        const selectedTab = newTabs.splice(idx, 1)
        newTabs.unshift(selectedTab[0])

        setActive(newTabs[0])
        if(larger.lg) {
            onTabClick?.()
        }
    }

    return (
        <>
            {propTabs.map((tab, idx) => (
                <button
                    key={tab.title}
                    className={classNames(
                        'relative px-5 py-2 rounded-xl',
                        tabClassName,
                    )}
                    onClick={() => {
                        moveSelectedTabToTop(idx)
                    }}
                    onMouseEnter={() => moveSelectedTabToTop(idx)}
                    onMouseLeave={() => setShow(false)}
                >
                    {active.value === tab.value && (
                        <div
                            className={classNames(
                                'absolute inset-0 rounded-xl transition-all duration-300 ease-out',
                                show && 'bg-gray-100 dark:bg-gray-700',
                            )}
                        />
                    )}
                    {}
                    {(tab as AnchorTab).to ? (
                        <Link
                            smooth
                            to={(tab as AnchorTab).to}
                            className="relative block heading-text z-10"
                            duration={500}
                        >
                            {tab.title}
                        </Link>
                    ) : (
                        <NextLink
                            href={(tab as LinkTab).href}
                            className="relative block heading-text z-10"
                        >
                            {tab.title}
                        </NextLink>
                    )}
                </button>
            ))}
        </>
    )
}

export default NavList
