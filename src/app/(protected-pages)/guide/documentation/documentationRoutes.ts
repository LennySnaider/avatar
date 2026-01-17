import type { DocumentationRoute } from '@/@types/docs'

const documentationRoutes: DocumentationRoute[] = [
    {
        groupName: 'Getting Started',
        nav: [
            {
                path: '/guide/documentation/introduction',
                label: 'Introduction',
            },
            {
                path: '/guide/documentation/installation',
                label: 'Installation',
            },
            {
                path: '/guide/documentation/tailwindcss',
                label: 'TailwindCSS',
            },
            {
                path: '/guide/documentation/css',
                label: 'CSS',
            },
            {
                path: '/guide/documentation/starter',
                label: 'Starter',
            },
            {
                path: '/guide/documentation/updating',
                label: 'Updating',
            },
        ],
    },
    {
        groupName: 'Development',
        nav: [
            {
                path: '/guide/documentation/development-server',
                label: 'Development Server',
            },
            {
                path: '/guide/documentation/environment-variables',
                label: 'Environment Variables',
            },
            {
                path: '/guide/documentation/folder-structure',
                label: 'Folder Structure',
            },
            {
                path: '/guide/documentation/routing',
                label: 'Routing',
            },
            {
                path: '/guide/documentation/create-new-page',
                label: 'Create New Page',
            },

            {
                path: '/guide/documentation/api-integration',
                label: 'API Integration',
            },
            {
                path: '/guide/documentation/authentication',
                label: 'Authentication',
            },
            {
                path: '/guide/documentation/state-management',
                label: 'State management',
            },
        ],
    },
    {
        groupName: 'Configuration',
        nav: [
            {
                path: '/guide/documentation/app',
                label: 'App Config',
            },
            {
                path: '/guide/documentation/layouts',
                label: 'Layouts',
            },
            {
                path: '/guide/documentation/navigation-config',
                label: 'Navigation Config',
            },
            {
                path: '/guide/documentation/theming',
                label: 'Theming',
            },
            {
                path: '/guide/documentation/internationalization',
                label: 'Internationalization',
            },
            {
                path: '/guide/documentation/dark-light-mode',
                label: 'Dark/Light Mode',
            },
            {
                path: '/guide/documentation/direction',
                label: 'Direction',
            },
            {
                path: '/guide/documentation/overall-theme-config',
                label: 'Overall Theme Config',
            },
        ],
    },
    {
        groupName: 'Deployment',
        nav: [
            {
                path: '/guide/documentation/build-production',
                label: 'Build production',
            },
        ],
    },
    {
        groupName: 'Other',
        nav: [
            {
                path: '/guide/documentation/credit',
                label: 'Sources & Credits',
            },
        ],
    },
]

export default documentationRoutes
