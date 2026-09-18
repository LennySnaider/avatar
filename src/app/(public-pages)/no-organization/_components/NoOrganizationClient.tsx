'use client'

import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import handleSignOut from '@/server/actions/auth/handleSignOut'

const NoOrganizationClient = () => {
    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <div className="w-full max-w-md">
                <h3 className="mb-2">
                    Tu cuenta ya no pertenece a ninguna organización
                </h3>
                <p className="mb-4">
                    El propietario de la organización te ha dado de baja, o tu
                    cuenta se quedó sin organización. Tu cuenta sigue
                    existiendo, pero no hay nada que mostrar hasta que alguien
                    te vuelva a invitar.
                </p>
                <Alert type="info" showIcon className="mb-4">
                    Si te van a invitar de nuevo, pídeles que usen{' '}
                    <b>otro email</b>: éste ya tiene cuenta y una invitación a
                    un email con cuenta se rechaza.
                </Alert>
                <Button
                    block
                    variant="solid"
                    type="button"
                    onClick={() => handleSignOut()}
                >
                    Cerrar sesión
                </Button>
            </div>
        </div>
    )
}

export default NoOrganizationClient
