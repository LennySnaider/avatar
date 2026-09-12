export type HorizontalMenuMeta =
    | {
          layout: 'default'
      }
    | {
          layout: 'columns'
          showColumnTitle?: boolean
          columns: 1 | 2 | 3 | 4 | 5
      }
    | {
          layout: 'tabs'
          columns: 1 | 2 | 3 | 4 | 5
      }

export interface NavigationTree {
    key: string
    path: string
    isExternalLink?: boolean
    title: string
    translateKey: string
    icon: string
    type: 'title' | 'collapse' | 'item'
    authority: string[]
    subMenu: NavigationTree[]
    description?: string
    meta?: {
        horizontalMenu?: HorizontalMenuMeta
        description?: {
            translateKey: string
            label: string
        }
        /**
         * Slug de `module_catalog` que la organización debe tener instalado
         * para ver este ítem. El filtro se aplica en servidor
         * (`filterNavigationByModules`); el gate real de acceso vive en el
         * layout de la ruta y en cada server action.
         */
        requiredModule?: string
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TranslationFn = any
