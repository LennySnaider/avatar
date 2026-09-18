import dashboardsNavigationConfig from './dashboards.navigation.config'
import conceptsNavigationConfig from './concepts.navigation.config'
import type { NavigationTree } from '@/@types/navigation'

const navigationConfig: NavigationTree[] = [
    // "Inicio" primero: es el destino tras el login.
    ...dashboardsNavigationConfig,
    ...conceptsNavigationConfig,
]

export default navigationConfig
