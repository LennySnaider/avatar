import Container from '@/components/shared/Container'
import AvatarStudioProvider from './AvatarStudioProvider'
import AvatarStudioMain from './AvatarStudioMain'
import StudioTabs from './StudioTabs'
import type { ComponentProps } from 'react'

/**
 * Cascarón compartido del Avatar Studio. Existe porque las DOS rutas que lo
 * montan —`/avatar-studio` (avatar por ?avatarId=) y `/avatar-studio/[slug]`
 * (avatar por path)— tenían cada una su propia copia del árbol de render, y
 * divergieron: la de [slug] se quedó SIN `<StudioTabs>`, que es quien aporta
 *
 *   1. el `headerSlot` al que AvatarStudioMain portalea sus acciones de header
 *      (Prompts / Upload / Tools / búsqueda) — sin destino, no se pintan; y
 *   2. la cadena de ALTURA DEFINIDA (`h-[calc(100vh-…)]` → `flex-1 min-h-0`)
 *      que necesita el `h-full` de AvatarStudioMain para resolver. Sin ella la
 *      columna crece con la galería y la barra de creación queda fuera de
 *      vista (reporte: "con esta url no se ve la barra").
 *
 * Las páginas solo difieren en CÓMO obtienen el avatar; el render es idéntico,
 * así que vive aquí una sola vez y no puede volver a desincronizarse.
 */
type ProviderProps = ComponentProps<typeof AvatarStudioProvider>

export default function StudioShell({
    userId,
    ...providerProps
}: Omit<ProviderProps, 'children'> & { userId?: string }) {
    return (
        <AvatarStudioProvider {...providerProps}>
            <StudioTabs>
                <Container className="h-full">
                    <AvatarStudioMain userId={userId} />
                </Container>
            </StudioTabs>
        </AvatarStudioProvider>
    )
}
