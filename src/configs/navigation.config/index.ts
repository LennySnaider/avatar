import dashboardsNavigationConfig from './dashboards.navigation.config'
import conceptsNavigationConfig from './concepts.navigation.config'
import type { NavigationTree } from '@/@types/navigation'

/**
 * F4.4 — El panel de plataforma. Va AL FINAL y fuera de los grupos del
 * producto porque no pertenece a ninguna organización: está por encima de
 * todas. `requiresPlatformAdmin` lo esconde a todo el mundo salvo a quien
 * opera el sistema, y esconder no autoriza — la página y cada acción vuelven
 * a comprobarlo en servidor.
 */
const platformNavigationConfig: NavigationTree[] = [
    {
        key: 'platform',
        path: '/platform',
        title: 'Plataforma',
        translateKey: 'nav.platform',
        icon: 'platform',
        type: 'item',
        authority: [],
        subMenu: [],
        meta: { requiresPlatformAdmin: true },
    },
]

const navigationConfig: NavigationTree[] = [
    // "Inicio" primero: es el destino tras el login.
    ...dashboardsNavigationConfig,
    ...conceptsNavigationConfig,
    ...platformNavigationConfig,
]

export default navigationConfig
