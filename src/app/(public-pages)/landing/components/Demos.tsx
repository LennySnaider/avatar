'use client'
import { useState } from 'react'
import Button from '@/components/ui/Button'
import Container from './LandingContainer'
import demoCategoriesIcons from '../utils/demo-categories-icons.config'
import {
    allDemos,
    projectDemos,
    ecommerceDemos,
    aiDemos,
    appsDemos,
    marketingDemos,
    helpCenterDemos,
    accountDemos,
    authDemos,
} from '../utils//demos-gallery.config'
import classNames from '@/utils/classNames'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Mode } from '@/@types/theme'

type DemoProps = {
    mode: Mode
}

const demoList: Record<
    string,
    {
        id: string
        name: string
        path: string
    }[]
> = {
    all: allDemos,
    project: projectDemos,
    ecommerce: ecommerceDemos,
    ai: aiDemos,
    apps: appsDemos,
    marketing: marketingDemos,
    helpCenter: helpCenterDemos,
    accounts: accountDemos,
    auth: authDemos,
}

const tabList = [
    {
        id: 'all',
        name: 'Dashboard',
    },
    {
        id: 'ecommerce',
        name: 'Ecommerce',
    },
    {
        id: 'project',
        name: 'Project',
    },
    {
        id: 'marketing',
        name: 'Marketing',
    },
    {
        id: 'ai',
        name: 'AI',
    },
    {
        id: 'helpCenter',
        name: 'Help Center',
    },

    {
        id: 'apps',
        name: 'Apps',
    },
    {
        id: 'accounts',
        name: 'Accounts',
    },
    {
        id: 'auth',
        name: 'Auth',
    },
]

const DemoCard = ({
    id,
    name,
    path,
    mode,
}: {
    id: string
    name: string
    path: string
    mode: Mode
}) => {
    return (
        <Link href={path}>
            <div
                className="bg-gray-50 dark:bg-gray-700 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 h-max transition-all duration-300"
            >
                <div className="rounded-xl overflow-hidden">
                    <img
                        className="rounded-xl transition-transform duration-300 hover:scale-105"
                        src={
                            mode === 'light'
                                ? `/img/landing/demo/${id}.webp`
                                : `/img/landing/demo/${id}-dark.webp`
                        }
                        alt={name}
                    />
                </div>
                <div className="mt-4">
                    <h3 className="text-lg font-bold">{name}</h3>
                </div>
            </div>
        </Link>
    )
}

const Tabs = ({
    selectedTab,
    setSelectedTab,
}: {
    selectedTab: string
    setSelectedTab: (id: string) => void
}) => {
    return (
        <div className="flex flex-col gap-2">
            {tabList.map((tab) => (
                <button
                    key={tab.id}
                    className={classNames(
                        'font-semibold px-3 rounded-lg flex items-center w-full whitespace-nowrap gap-x-2 transition-colors duration-150 h-12 ',
                        tab.id === selectedTab
                            ? 'text-primary bg-primary-subtle hover:texy-primary hover:bg-primary-subtle'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 hover:bg-gray-100 dark:hover:text-gray-100 dark:hover:bg-gray-700',
                    )}
                    onClick={() => setSelectedTab(tab.id)}
                >
                    <span className="text-2xl">
                        {demoCategoriesIcons[tab.id]}
                    </span>
                    <span>{tab.name}</span>
                </button>
            ))}
        </div>
    )
}

const Demos = ({ mode }: DemoProps) => {
    const [selectedTab, setSelectedTab] = useState('all')

    const router = useRouter()

    const handleViewAllDemos = () => {
        router.push('/dashboards/ecommerce')
    }

    return (
        <div id="demos" className="relative z-20 py-10 md:py-40">
            <div className="text-center mb-12">
                <h2 className="my-6 text-5xl">
                    Built for Any Project, Big or Small
                </h2>
                <p className="mx-auto max-w-[600px]">
                    Whether you need an admin panel, an interactive dashboard,
                    or a full-featured application, Ecme is the ultimate
                    solution
                </p>
            </div>
            <Container>
                <div className="flex gap-12">
                    <div className="min-w-[250px] hidden md:block">
                        <Tabs
                            selectedTab={selectedTab}
                            setSelectedTab={setSelectedTab}
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(demoList[selectedTab] || []).map((demo) => (
                            <DemoCard
                                key={demo.id}
                                id={demo.id}
                                name={demo.name}
                                path={demo.path}
                                mode={mode}
                            />
                        ))}
                    </div>
                </div>
                <div className="mt-20 text-center">
                    <Button
                        className="inline-flex items-center"
                        onClick={handleViewAllDemos}
                    >
                        View all demos
                    </Button>
                </div>
            </Container>
        </div>
    )
}

export default Demos
