'use client'
import SyntaxHighlighter from '@/components/shared/SyntaxHighlighter'
import DemoComponentApi from '@/components/docs/DemoComponentApi'

const Page = () => {
    return (
        <>
            <p>
                Ecme routing follows the Next.js App Router conventions, it uses
                a file-based routing system where each file in the{' '}
                <code>/app</code> directory corresponds to a route in your
                application. Subfolders represent nested routes, making it easy
                to structure complex navigation.
            </p>
            <p>
                For detailed information & concepts about the{' '}
                <strong>Next.js App Router</strong>, please refer to the
                <a
                    href="https://nextjs.org/docs/app/building-your-application/routing"
                    target="_blank"
                >
                    {' '}
                    documentation
                </a>
            </p>
            <div className="mt-6" id="overview">
                <h5>Route configuration</h5>
                <p className="my-1">
                    Although Next.js provides a robust and powerful routing
                    system out of the box, our template introduces an additional
                    layer of routing configuration. This approach allows us to
                    extend and customize the behavior of each page while
                    maintaining flexibility and scalability
                </p>
                <p>
                    The router configuration for the template can be found in{' '}
                    <code>src/configs/routes.config/index.ts</code>. There are 3
                    main groups of routes:
                </p>
                <SyntaxHighlighter language="js">{`export const publicRoutes = [
    ...
]

export const protectedRoutes = [
    ...
]

export const authRoutes = [
    ...
]
`}</SyntaxHighlighter>
                <ul>
                    <li>
                        <strong>publicRoutes:</strong>
                        <p className="mt-1">
                            This group includes all routes that are accessible
                            to all users.
                        </p>
                    </li>
                    <li>
                        <strong>protectedRoutes:</strong>
                        <p className="mt-1">
                            This group contains routes that require
                            authentication to access.
                        </p>
                    </li>
                    <li>
                        <strong>authRoutes:</strong>
                        <p className="mt-1">
                            This group configuration handles routes related to
                            login, registration, and authentication processes.
                        </p>
                    </li>
                </ul>
            </div>
            <div className="mt-10" id="configurationStructure">
                <h5>Configuration Structure</h5>
                <p className="mt-1">
                    Our custom routing configuration introduces a structured way
                    to define and extend the behavior of each route in the
                    application. Here&apos;s a breakdown of the configuration
                    structure:
                </p>
                <SyntaxHighlighter language="js">{`export const protectedRoutes = {
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
}`}</SyntaxHighlighter>
                <h6>Key Components of the Configuration:</h6>
                <ol>
                    <li>
                        <p>
                            <strong>Route Keys (Matchers):</strong>
                            <br />
                            Each key in the
                            <code>routes</code> object (e.g.,{' '}
                            <code>&apos;/articles&apos;</code>,
                            <code>&apos;/articles/[slug]&apos;</code>) serves as
                            a <strong>route matcher</strong> for the current
                            URL. When a user visits a page, the application
                            matches the URL against the route keys in the
                            configuration. Once a match is found, it retrieves
                            the corresponding route data from the configuration
                            object and applies the defined settings.
                        </p>
                        <p>For example:</p>
                        <ul>
                            <li>
                                <code>&apos;/articles&apos;</code> matches a
                                static route.
                            </li>
                            <li>
                                <code>&apos;/articles/[slug]&apos;</code>{' '}
                                matches a dynamic route, where
                                <code>[slug]</code> is a placeholder for
                                replaced with the actual dynamic value from the
                                URL.
                            </li>
                        </ul>
                    </li>
                    <li>
                        <p>
                            <strong>Configuration Object:</strong>
                            <br />
                            Each route key maps to a configuration object
                            containing the following properties:
                        </p>
                        <ul>
                            <li>
                                <strong>key:</strong>
                                <br />
                                An identifier for the route that pair with
                                navigation config.
                            </li>
                            <li>
                                <strong>authority:</strong>
                                <br />
                                An array of roles (e.g.,{' '}
                                <code>[ADMIN, USER]</code>) that specifies which
                                user roles are allowed to access the route. This
                                implements Role-Based Access Control (RBAC).
                            </li>
                            <li>
                                <strong>meta:</strong>
                                <br />
                                Metadata for the route, providing additional
                                customization options:
                            </li>
                            <li>
                                <strong>dynamicRoute:</strong>
                                <br />A boolean flag indicating whether the
                                route is dynamic (i.e., contains a parameter
                                placeholder <code>[slug]</code>).
                            </li>
                        </ul>
                    </li>
                </ol>
            </div>

            <div className="mt-10" id="authority">
                <h5>Authority</h5>
                <p className="mt-1">
                    Ecme routes support simple role-based access control. You
                    can specify the roles that have access to a route by using
                    the <code>authority</code> field. For example, the following
                    route is only accessible to users with the{' '}
                    <code>&apos;admin&apos;</code> or{' '}
                    <code>&apos;user&apos;</code> roles. If the{' '}
                    <code>authority</code> field is left as an empty array, the
                    route will be open to all roles.
                </p>
                <SyntaxHighlighter language="js">{`export const protectedRoutes = [
    {
        ...
        authority: ['admin', 'user'],
    },			
]`}</SyntaxHighlighter>
                <p>
                    Of course, the authority model is flexible and can be
                    changes to meet your projects specific requirements. You can
                    configure it to intercept user access either at the
                    middleware level on the server or directly at the client
                    level for enhanced control.
                </p>
            </div>
            <div className="mt-10" id="meta">
                <h5>Meta</h5>
                <p className="mt-1">
                    The <code>meta</code> field allows you to pass additional
                    information to the <code>PageContainer</code> or the view
                    component associated with the route.
                </p>
                <SyntaxHighlighter language="js">{`export const protectedRoutes = [
    {
        ...
        meta: {
            pageContainerType: 'gutter',
            header: {
                title: 'My tittle',
                description: 'Some description'
                contained: false,
                extraHeader: lazy(() => import('@/components/SomeComponent')),
            },
            footer: false,
            layout: 'blank',
        }
    },			
]`}</SyntaxHighlighter>
                <p>
                    The layout will be able to access all the <code>meta</code>{' '}
                    data specified.
                </p>
                <DemoComponentApi
                    hideApiTitle
                    keyText="properties"
                    api={[
                        {
                            api: [
                                {
                                    propName: 'pageContainerType',
                                    type: `<code>'default'</code>  | <code>'gutterless'</code> | <code>'contained'</code>`,
                                    default: `<code>'default'</code>`,
                                    desc: 'Defines the type of the view container',
                                },
                                {
                                    propName: 'pageBackgroundType',
                                    type: `<code>'default'</code>  | <code>'plain'</code>`,
                                    default: '-',
                                    desc: 'Define the type of the page background',
                                },
                                {
                                    propName: 'header',
                                    type: `<code>{
                                                title?: string | ReactNode | LazyExoticComponent<() => JSX.Element>
                                                description?: string | ReactNode
                                                contained?: boolean
                                                extraHeader?: string | ReactNode | LazyExoticComponent<() => JSX.Element>
                                            }</code>`,
                                    default: '-',
                                    desc: 'Specifies the page header & further configuration',
                                },
                                {
                                    propName: 'footer',
                                    type: `<code>boolean</code>`,
                                    default: `<code>true</code>`,
                                    desc: 'Determines whether to display the footer',
                                },
                                {
                                    propName: 'layout',
                                    type: `<code>'blank'</code>  | <code>'collapsibleSide'</code> | <code>'stackedSide'</code> | <code>'topBarClassic'</code> | <code>'framelessSide'</code> | <code>'contentOverlay'</code>`,
                                    default: `-`,
                                    desc: 'Overrides the current layout for this page',
                                },
                            ],
                        },
                    ]}
                />
            </div>
        </>
    )
}

export default Page
