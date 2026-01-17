import Switcher from '@/components/ui/Switcher'
import Container from './LandingContainer'
import CardStack from './CardStack'
import InfiniteMovingCards from './InfinteMovingCard'
import presetThemeSchemaConfig from '@/configs/preset-theme-schema.config'
import classNames from '@/utils/classNames'
import componentsIcons from '../utils/components-icons.config'
import Image from 'next/image'
import { TbCheck } from 'react-icons/tb'
import type { Mode } from '@/@types/theme'
import type { ReactNode } from 'react'

type CardProps = {
    children: ReactNode
    className?: string
}

type FeaturesProps = {
    mode: Mode
    onModeChange: (value: boolean) => void
    schema: string
    setSchema: (value: string) => void
}

const getCardBgStyles = (mode: Mode = 'light') => {
    const bgStyles = {
        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='16' height='16' fill='none'%3e%3ccircle fill='${mode === 'light' ? 'rgb(0 0 0 / 0.2)' : 'rgb(255 255 255 / 0.2)'}' id='pattern-circle' cx='10' cy='10' r='1.6257413380501518'%3e%3c/circle%3e%3c/svg%3e")`,
    }
    return bgStyles
}

const Card = ({
    children,
    className,
}: CardProps) => {
    return (
        <div
            className={classNames(
                'bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-800 p-6',
                className,
            )}
        >
            {children}
        </div>
    )
}

const componentItems1 = [
    { id: 'uiCommonButton', name: 'Common Button', link: 'button' },
    { id: 'uiCommonGrid', name: 'Common Grid', link: 'grid' },
    { id: 'uiCommonTypography', name: 'Common Typography', link: 'typography' },
    { id: 'uiCommonIcons', name: 'Common Icons', link: 'icons' },
    { id: 'uiFeedbackAlert', name: 'Feedback Alert', link: 'alert' },
    { id: 'uiFeedbackDialog', name: 'Feedback Dialog', link: 'dialog' },
    { id: 'uiFeedbackDrawer', name: 'Feedback Drawer', link: 'drawer' },
    { id: 'uiFeedbackProgress', name: 'Feedback Progress', link: 'progress' },
    { id: 'uiFeedbackSpinner', name: 'Feedback Spinner', link: 'spinner' },
    { id: 'uiFormsSwitcher', name: 'Forms Switcher', link: 'switcher' },
    {
        id: 'uiNavigationPagination',
        name: 'Navigation Pagination',
        link: 'pagination',
    },
]

const componentItems2 = [
    { id: 'uiDataDisplayAvatar', name: 'Data Display Avatar', link: 'avatar' },
    { id: 'uiDataDisplayBadge', name: 'Data Display Badge', link: 'badge' },
    {
        id: 'uiDataDisplayCalendar',
        name: 'Data Display Calendar',
        link: 'calendar',
    },
    { id: 'uiDataDisplayCard', name: 'Data Display Card', link: 'card' },
    { id: 'uiDataDisplayTable', name: 'Data Display Table', link: 'table' },
    { id: 'uiDataDisplayTag', name: 'Data Display Tag', link: 'tag' },
    {
        id: 'uiDataDisplayTimeline',
        name: 'Data Display Timeline',
        link: 'timeline',
    },
    {
        id: 'uiDataDisplayTooltip',
        name: 'Data Display Tooltip',
        link: 'tooltip',
    },
    { id: 'uiFormsCheckbox', name: 'Forms Checkbox', link: 'checkbox' },
    { id: 'uiFormsDatepicker', name: 'Forms Datepicker', link: 'datepicker' },
    {
        id: 'uiFormsFormControl',
        name: 'Forms Form Control',
        link: 'form-control',
    },
    { id: 'uiFormsInput', name: 'Forms Input', link: 'input' },
]

const Features = ({ mode, onModeChange, schema, setSchema }: FeaturesProps) => {
    const cardStyles = getCardBgStyles(mode)

    const CARDS = [
        {
            id: 0,
            name: 'Collapsible',
            content: (
                <Image
                    className="rounded-xl"
                    src="/img/landing/layouts/collapsible.webp"
                    width={420}
                    height={240}
                    alt="layout"
                />
            ),
        },
        {
            id: 1,
            name: 'Stacked',
            content: (
                <Image
                    className="rounded-xl"
                    src="/img/landing/layouts/stacked.webp"
                    width={420}
                    height={240}
                    alt="layout"
                />
            ),
        },
        {
            id: 2,
            name: 'Topbar',
            content: (
                <Image
                    className="rounded-xl"
                    src="/img/landing/layouts/topbar.webp"
                    width={420}
                    height={240}
                    alt="layout"
                />
            ),
        },
        {
            id: 3,
            name: 'Frameless',
            content: (
                <Image
                    className="rounded-xl"
                    src="/img/landing/layouts/frameless.webp"
                    width={420}
                    height={240}
                    alt="layout"
                />
            ),
        },
        {
            id: 4,
            name: 'Overlay',
            content: (
                <Image
                    className="rounded-xl"
                    src="/img/landing/layouts/overlay.webp"
                    width={420}
                    height={240}
                    alt="layout"
                />
            ),
        },
    ]

    const renderComponentIcon = (item: {
        id: string
        name: string
        link: string
    }) => {
        return (
            <a
                href={`https://ecme-next.themenate.net/ui-components/${item.link}`}
                target="_blank"
                rel="noreferrer"
                className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 h-20 w-20 flex items-center justify-center rounded-2xl"
            >
                <span className="text-primary text-4xl">
                    {componentsIcons[item.id]}
                </span>
            </a>
        )
    }

    return (
        <div id="features" className="relative z-20 py-10 md:py-40">
            <Container>
                <div className="text-center mb-12">
                    <h2 className="my-6 text-5xl">
                        Discover the Power of Ecme
                    </h2>
                    <p className="mx-auto max-w-[600px]">
                        Crafted for performance, scalability, and ease of
                        use—experience a template built to meet all your project
                        needs
                    </p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="col-span-2">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <Card>
                                <div
                                    className="rounded-2xl bg-white dark:bg-gray-900 p-4"
                                    style={cardStyles}
                                >
                                    <div className="p-4 flex justify-center items-center rounded-xl gap-2 border border-gray-200 dark:border-white/[0.2] bg-white dark:bg-gray-800">
                                        <Switcher
                                            checked={mode === 'dark'}
                                            onChange={onModeChange}
                                        />
                                        <span>
                                            {mode === 'dark' ? 'Dark' : 'Light'}
                                        </span>
                                    </div>
                                    <div className="p-4 flex justify-center items-center rounded-xl gap-2 border border-gray-200 dark:border-white/[0.2] bg-white dark:bg-gray-800 mt-4">
                                        <div className="inline-flex items-center gap-2">
                                            {Object.entries(
                                                presetThemeSchemaConfig,
                                            ).map(([key, value]) => (
                                                <button
                                                    key={key}
                                                    className={classNames(
                                                        'h-8 w-8 rounded-full flex items-center justify-center border-2 border-white',
                                                        schema === key &&
                                                            'ring-2 ring-primary',
                                                    )}
                                                    style={{
                                                        backgroundColor:
                                                            value[mode]
                                                                .primary || '',
                                                    }}
                                                    onClick={() =>
                                                        setSchema(key)
                                                    }
                                                >
                                                    {schema === key ? (
                                                        <TbCheck className="text-neutral text-lg" />
                                                    ) : (
                                                        <></>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-6">
                                    <h4 className="font-bold">
                                        Customizable Themes
                                    </h4>
                                    <p className="mt-2">
                                        Effortlessly switch between light and
                                        dark modes or create your custom theme.
                                    </p>
                                </div>
                            </Card>
                            <Card>
                                <div
                                    className="rounded-2xl bg-white dark:bg-gray-900 p-4 overflow-hidden relative h-[172px]"
                                    style={cardStyles}
                                >
                                    <a
                                        style={{
                                            transformOrigin:
                                                'bottom right 10px',
                                        }}
                                        href="https://ecme-next.themenate.net/guide/documentation/introduction"
                                        target="_blank"
                                        className="absolute max-w-[330px] top-7 -right-12 transition-transform duration-300 hover:scale-105"
                                    >
                                        <div className="p-2 border border-gray-200 bg-gray-50 dark:bg-gray-700 dark:border-gray-700 rounded-lg relative shadow-2xl dark:shadow-white/40">
                                            {mode === 'light' && (
                                                <Image
                                                    className="rounded-lg"
                                                    src="/img/landing/layouts/documentation.png"
                                                    width={630}
                                                    height={562}
                                                    alt="Ecme documentaion"
                                                />
                                            )}
                                            {mode === 'dark' && (
                                                <Image
                                                    className="rounded-lg"
                                                    src="/img/landing/layouts/documentation-dark.png"
                                                    width={630}
                                                    height={562}
                                                    alt="Ecme documentaion"
                                                />
                                            )}
                                        </div>
                                    </a>
                                </div>
                                <div className="mt-6">
                                    <h4 className="font-bold">
                                        Comprehensive documentation
                                    </h4>
                                    <p className="mt-2">
                                        Detailed step-by-step guides to help you
                                        get started and master the template.
                                    </p>
                                </div>
                            </Card>
                        </div>
                        <div className="mt-4">
                            <Card>
                                <div
                                    className="rounded-2xl bg-white dark:bg-gray-900 p-4 overflow-hidden relative"
                                    style={cardStyles}
                                >
                                    <div className="min-h-[270px] flex items-center justify-center w-full">
                                        <CardStack
                                            className="absolute -bottom-6"
                                            items={CARDS}
                                        />
                                    </div>
                                </div>
                                <div className="mt-6">
                                    <h4 className="font-bold">
                                        Multiple Layouts
                                    </h4>
                                    <p className="mt-2">
                                        Choose from various layout options to
                                        match your needs. Whether it&apos;s
                                        vertical, horizontal, or RTL
                                        (right-to-left), we provide flexibility
                                        for any design style or language.
                                    </p>
                                </div>
                            </Card>
                        </div>
                    </div>
                    <div>
                        <Card className="h-full">
                            <div className="flex flex-col justify-between h-full">
                                <div
                                    className="flex-1 rounded-2xl bg-white dark:bg-gray-900 p-4 overflow-hidden relative"
                                    style={cardStyles}
                                >
                                    <div className="min-h-[270px] flex items-center justify-center w-full">
                                        <div className="h-[38.5rem] rounded-md flex flex-col antialiased items-center justify-center relative overflow-hidden">
                                            <div className="h-[38.5rem] grid grid-cols-2 gap-x-12">
                                                <InfiniteMovingCards
                                                    items={componentItems1}
                                                    speed="slow"
                                                    pauseOnHover={false}
                                                    itemCallback={(item) =>
                                                        renderComponentIcon(
                                                            item,
                                                        )
                                                    }
                                                />
                                                <InfiniteMovingCards
                                                    items={componentItems2}
                                                    direction="top"
                                                    speed="slow"
                                                    pauseOnHover={false}
                                                    itemCallback={(item) =>
                                                        renderComponentIcon(
                                                            item,
                                                        )
                                                    }
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-6">
                                    <h4 className="font-bold">
                                        Handcrafted Tailwind Components
                                    </h4>
                                    <p className="mt-2">
                                        A collection of custom-made, highly
                                        flexible Tailwind components that fit
                                        any use case.
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            </Container>
        </div>
    )
}

export default Features
