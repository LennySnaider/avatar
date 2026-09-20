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
         * (`filterNavigation`); el gate real de acceso vive en el
         * layout de la ruta y en cada server action.
         */
        requiredModule?: string
        /**
         * Permiso de `@/lib/org/permissions` que el rol del usuario debe tener
         * para ver este ítem. Mismo alcance que requiredModule: sólo OCULTA;
         * el gate real vive en el layout de la ruta y en cada server action.
         */
        requiredPermission?: import('@/lib/org/permissions').Permission
        /**
         * F4.4 — Sólo para el administrador de la PLATAFORMA. Es un eje
         * distinto de `requiredPermission`: aquél pregunta qué puede hacer un
         * miembro dentro de su organización, éste si la persona opera el
         * sistema. Ser `owner` de la propia organización no lo concede.
         */
        requiresPlatformAdmin?: boolean
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TranslationFn = any
