import { DASHBOARDS_PREFIX_PATH } from '@/constants/route.constant'
import { NAV_ITEM_TYPE_ITEM } from '@/constants/navigation.constant'
import { ADMIN, USER } from '@/constants/roles.constant'
import type { NavigationTree } from '@/@types/navigation'

/**
 * "Inicio": el dashboard de ingresos de la organización (Fanvue + Telegram
 * Stars), primer ítem del menú y destino tras el login
 * (`authenticatedEntryPath` en app.config.ts).
 *
 * Los cuatro dashboards demo de la plantilla ECME (ecommerce, project,
 * marketing, analytic) siguen existiendo por URL como patrones de referencia,
 * pero no se listan: son datos mock y sólo confundían.
 */
const dashboardsNavigationConfig: NavigationTree[] = [
    {
        key: 'dashboard.home',
        path: `${DASHBOARDS_PREFIX_PATH}/home`,
        title: 'Inicio',
        translateKey: 'nav.dashboard.home',
        icon: 'dashboardHome',
        type: NAV_ITEM_TYPE_ITEM,
        authority: [ADMIN, USER],
        subMenu: [],
    },
]

export default dashboardsNavigationConfig
