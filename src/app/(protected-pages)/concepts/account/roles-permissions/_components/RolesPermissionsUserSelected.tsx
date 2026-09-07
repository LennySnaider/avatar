'use client'

import StickyFooter from '@/components/shared/StickyFooter'
import { useRolePermissionsStore } from '../_store/rolePermissionsStore'
import { TbChecks } from 'react-icons/tb'

/**
 * Aqui habia un "Delete" con ConfirmDialog de tipo danger y el texto "This
 * action can't be undo", y lo unico que hacia era filtrar el array del store:
 * las filas desaparecian de la tabla y volvian intactas al recargar. Es la misma
 * mentira que el resto de esta pagina, pero en la version peor —la pantalla
 * afirmaba haber BORRADO cuentas— asi que la accion se retira en vez de dejarla
 * inerte: un boton destructivo que no destruye acaba usandose de verdad el dia
 * que alguien lo conecte a medias.
 *
 * Para que vuelva hace falta lo mismo que para toda la fase de roles (ver
 * RolesPermissionsAccessDialog.tsx): usuarios reales de la organizacion, una
 * baja que decida si es borrado o desactivacion, y la comprobacion en servidor.
 * La seleccion se conserva porque no afirma nada: contar lo marcado es cierto.
 */
const RolesPermissionsUserSelected = () => {
    const selectedUser = useRolePermissionsStore((state) => state.selectedUser)

    return (
        <>
            {selectedUser.length > 0 && (
                <StickyFooter
                    className="-mx-8 flex items-center justify-between py-4 bg-white dark:bg-gray-800"
                    stickyClass="border-t border-gray-200 dark:border-gray-700 px-8"
                    defaultClass="container mx-auto px-8 rounded-xl border border-gray-200 dark:border-gray-600 mt-4"
                >
                    <div className="container mx-auto">
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <span className="text-lg text-primary">
                                    <TbChecks />
                                </span>
                                <span className="font-semibold flex items-center gap-1">
                                    <span className="heading-text">
                                        {selectedUser.length} Users
                                    </span>
                                    <span>selected</span>
                                </span>
                            </span>
                            <span>No bulk action is available yet</span>
                        </div>
                    </div>
                </StickyFooter>
            )}
        </>
    )
}

export default RolesPermissionsUserSelected
