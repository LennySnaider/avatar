'use client'
import { useMemo } from 'react'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import Segment from '@/components/ui/Segment'
import Dialog from '@/components/ui/Dialog'
import Alert from '@/components/ui/Alert'
import ScrollBar from '@/components/ui/ScrollBar'
import { useRolePermissionsStore } from '../_store/rolePermissionsStore'
import { accessModules } from '../constants'
import classNames from '@/utils/classNames'
import isLastChild from '@/utils/isLastChild'
import sleep from '@/utils/sleep'
import {
    TbUserCog,
    TbBox,
    TbSettings,
    TbFiles,
    TbFileChart,
    TbCheck,
} from 'react-icons/tb'
import type { ReactNode } from 'react'

const moduleIcon: Record<string, ReactNode> = {
    users: <TbUserCog />,
    products: <TbBox />,
    configurations: <TbSettings />,
    files: <TbFiles />,
    reports: <TbFileChart />,
}

/**
 * Este dialogo era el mas peligroso de las maquetas de ECME, porque el que lo
 * usa es un admin y lo que creia estar tocando era el control de acceso:
 *
 *  - "Create" (`handleSubmit`) hacia `structuredClone(roleList)` + push +
 *    `setRoleList`: el rol nuevo aparecia en la rejilla de la pagina y se
 *    esfumaba al recargar. Nunca hubo peticion, ni tabla, ni nada.
 *  - "Update" (`handleUpdate`) era literalmente cerrar el dialogo tras un
 *    `sleep(300)`. Los cambios de permisos que se hubieran hecho se habian
 *    escrito ya en el store de Zustand desde `handleChange`, en memoria.
 *  - Los inputs de nombre y descripcion se leian por ref y se tiraban.
 *
 * Lo que se rompia por ello: un administrador podia dar por hecho que habia
 * retirado el permiso de "delete" sobre usuarios a un rol —y por tanto que
 * alguien ya no podia borrar— cuando no habia cambiado absolutamente nada, ni
 * siquiera para el resto de su propia sesion.
 *
 * NO se implementa aqui a proposito: roles y permisos es una fase de producto
 * que todavia no existe. Hoy la autorizacion de la app es la de
 * src/configs/routes.config (ADMIN/USER) mas el aislamiento por organizacion; no
 * hay modelo de permisos por modulo ni nada que consumiera este acceso. Para
 * hacerlo real harian falta, como minimo:
 *   - tablas de roles y de asignacion rol-usuario dentro de la organizacion,
 *   - un catalogo de permisos de VERDAD (los modulos de ./constants son de la
 *     plantilla: users, products, configurations, files, reports),
 *   - comprobacion en SERVIDOR en cada server action y route: una pantalla que
 *     esconde botones no es control de acceso,
 *   - y decidir que pasa con el ultimo admin de una organizacion.
 * Mientras tanto el dialogo enseña lo que hay, en solo lectura, y no acepta ni
 * un dato.
 */
const RolesPermissionsAccessDialog = () => {
    const roleList = useRolePermissionsStore((state) => state.roleList)

    const setRoleDialog = useRolePermissionsStore(
        (state) => state.setRoleDialog,
    )
    const setSelectedRole = useRolePermissionsStore(
        (state) => state.setSelectedRole,
    )

    const selectedRole = useRolePermissionsStore((state) => state.selectedRole)
    const roleDialog = useRolePermissionsStore((state) => state.roleDialog)

    const handleClose = async () => {
        setRoleDialog({
            type: '',
            open: false,
        })
        // Cosmetico: deja cerrar el dialogo antes de vaciar el rol, para que el
        // titulo no parpadee mientras se va.
        await sleep(300)
        setSelectedRole('')
    }

    const modules = useMemo(() => {
        return roleList.find((role) => role.id === selectedRole)
    }, [selectedRole, roleList])

    return (
        <Dialog
            isOpen={roleDialog.open}
            width={900}
            onClose={handleClose}
            onRequestClose={handleClose}
        >
            <h4>{roleDialog.type === 'new' ? 'Create role' : modules?.name}</h4>
            <ScrollBar className="mt-6 max-h-[600px] overflow-y-auto">
                <div className="px-4">
                    <Alert showIcon type="warning">
                        {roleDialog.type === 'new'
                            ? 'Roles cannot be created yet'
                            : 'Permissions are read-only'}
                    </Alert>
                    <p className="mt-4 leading-relaxed">
                        This app has no role and permission model yet: the roles
                        and the access rights below are sample data from the
                        template, and editing them would grant or revoke
                        nothing. Access is currently decided by your account
                        role and by the organisation you belong to.
                    </p>
                    {accessModules.map((module, index) => (
                        <div
                            key={module.id}
                            className={classNames(
                                'flex flex-col md:flex-row md:items-center justify-between gap-4 py-6 border-gray-200 dark:border-gray-600',
                                !isLastChild(accessModules, index) &&
                                    'border-b',
                            )}
                        >
                            <div className="flex items-center gap-4">
                                <Avatar
                                    className="bg-transparent dark:bg-transparent p-2 border-2 border-gray-200 dark:border-gray-600 text-primary"
                                    size={50}
                                    icon={moduleIcon[module.id]}
                                    shape="round"
                                />
                                <div>
                                    <h6 className="font-bold">{module.name}</h6>
                                    <span>{module.description}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <Segment
                                    className="bg-transparent dark:bg-transparent"
                                    selectionType="multiple"
                                    value={modules?.accessRight[module.id]}
                                >
                                    {module.accessor.map((access) => (
                                        <Segment.Item
                                            key={module.id + access.value}
                                            value={access.value}
                                        >
                                            {({ active }) => {
                                                return (
                                                    <Button
                                                        variant="default"
                                                        icon={
                                                            active ? (
                                                                <TbCheck className="text-primary text-xl" />
                                                            ) : (
                                                                <></>
                                                            )
                                                        }
                                                        active={active}
                                                        type="button"
                                                        disabled
                                                        className="md:min-w-[100px]"
                                                        size="sm"
                                                        customColorClass={({
                                                            active,
                                                        }) =>
                                                            classNames(
                                                                active &&
                                                                    'bg-transparent dark:bg-transparent text-primary border-primary ring-1 ring-primary',
                                                            )
                                                        }
                                                    >
                                                        {access.label}
                                                    </Button>
                                                )
                                            }}
                                        </Segment.Item>
                                    ))}
                                </Segment>
                            </div>
                        </div>
                    ))}
                    <div className="flex justify-end mt-6">
                        <Button variant="solid" onClick={handleClose}>
                            Close
                        </Button>
                    </div>
                </div>
            </ScrollBar>
        </Dialog>
    )
}

export default RolesPermissionsAccessDialog
