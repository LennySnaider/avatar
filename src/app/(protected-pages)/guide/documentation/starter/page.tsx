import SyntaxHighlighter from '@/components/shared/SyntaxHighlighter'
import CodeToggleTabs from '@/components/docs/DemoCard/CodeToggleTabs'
import Link from 'next/link'

const Page = () => {
    return (
        <>
            <p>
                As mentioned in the{' '}
                <Link href="/docs/documentation/installation">
                    Installation
                </Link>{' '}
                section, we&apos;ve provided a starter version with the
                essential core components and basic functionality setup. We
                highly recommend that developers use this version as the
                foundation for building their apps.
            </p>
            <p>
                When you open the starter pack in your local environment,
                you&apos;ll be directed to the login page. You can sign in using
                the credentials <i>user: admin | password: 123Qwe</i>.
            </p>
            <div className="mt-10" id="defaultConfig">
                <h5>Default Configurations</h5>
                <p>
                    Below are some of the default configurations for the starter
                    version. You can modify these settings to suit your needs.
                </p>
                <p className="mb-2">
                    <strong>AppConfig</strong> -{' '}
                    <Link href="/guide/documentation/app">Documentation</Link>
                </p>
                <CodeToggleTabs
                    languages={['jsx', 'jsx']}
                    tsMarkdown={`\`\`\`tsx
const appConfig: AppConfig = {
    apiPrefix: '/api',
    authenticatedEntryPath: '/home',
    unAuthenticatedEntryPath: '/sign-in',
    locale: 'en',
    activeNavTranslation: false
}`}
                    jsMarkdown={`\`\`\`jsx
const appConfig = {
    apiPrefix: '/api',
    authenticatedEntryPath: '/home',
    unAuthenticatedEntryPath: '/sign-in',
    locale: 'en',
    activeNavTranslation: false
}`}
                />
                <p className="mb-2">
                    <strong>ThemeConfig</strong> -{' '}
                    <Link href="/guide/documentation/overall-theme-config">
                        Documentation
                    </Link>
                </p>
                <CodeToggleTabs
                    languages={['jsx', 'jsx']}
                    tsMarkdown={`\`\`\`tsx
export const themeConfig: ThemeConfig = {
    schema: 'default',
    direction: THEME_ENUM.DIR_LTR,
    mode: THEME_ENUM.MODE_LIGHT,
    panelExpand: false,
    controlSize: 'md',
    layout: {
        type: THEME_ENUM.LAYOUT_COLLAPSIBLE_SIDE,
        sideNavCollapse: false,
    },
}`}
                    jsMarkdown={`\`\`\`jsx
export const themeConfig = {
    schema: 'default',
    direction: THEME_ENUM.DIR_LTR,
    mode: THEME_ENUM.MODE_LIGHT,
    panelExpand: false,
    controlSize: 'md',
    layout: {
        type: THEME_ENUM.LAYOUT_COLLAPSIBLE_SIDE,
        sideNavCollapse: false,
    },
}`}
                />
                <p className="mb-2">
                    <strong>RoutesConfig</strong> -{' '}
                    <Link href="/guide/documentation/routing">
                        Documentation
                    </Link>
                </p>
                <SyntaxHighlighter language="js">{`const publicRoutes = [
    '/home': {
        key: 'home',
        authority: [],
    }
]

export const protectedRoutes = {
    '/articles': {
        key: 'articles',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
        },
    },
    '/articles/[slug]': {
        key: 'articles.articleDetails',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
        },
        dynamicRoute: true
    },
}
`}</SyntaxHighlighter>
                <p className="mb-2">
                    <strong>NavConfig</strong> -{' '}
                    <Link href="/guide/documentation/routing">
                        Documentation
                    </Link>
                </p>
                <SyntaxHighlighter language="js">{`const navigationConfig = [
    {
        key: 'home',
        path: '/home',
        title: 'Home',
        translateKey: 'nav.home',
        icon: 'home',
        type: NAV_ITEM_TYPE_ITEM,
        authority: [],
        subMenu: []
    }
]
`}</SyntaxHighlighter>
            </div>
        </>
    )
}

export default Page
