import { ADMIN, USER } from '@/constants/roles.constant'
import type { Routes } from '@/@types/routes'

const dashboardsRoute: Routes = {
    '/dashboards/home': {
        key: 'dashboard.home',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
            pageBackgroundType: 'plain',
            footer: false,
        },
    },
    '/dashboards/ecommerce': {
        key: 'dashboard.ecommerce',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
        },
    },
    '/dashboards/project': {
        key: 'dashboard.project',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
        },
    },
    '/dashboards/marketing': {
        key: 'dashboard.marketing',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
        },
    },
    '/dashboards/analytic': {
        key: 'dashboard.analytic',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
            pageBackgroundType: 'plain',
        },
    },
}

export default dashboardsRoute
