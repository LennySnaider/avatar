import Container from '@/components/shared/Container'
import Alert from '@/components/ui/Alert'
import RolesPermissionsGroups from './_components/RolesPermissionsGroups'
import RolesPermissionsGroupsAction from './_components/RolesPermissionsGroupsAction'
import RolesPermissionsUserAction from './_components/RolesPermissionsUserAction'
import RolesPermissionsUserTable from './_components/RolesPermissionsUserTable'
import RolesPermissionsUserSelected from './_components/RolesPermissionsUserSelected'
import RolesPermissionsAccessDialog from './_components/RolesPermissionsAccessDialog'
import RolesPermissionsProvider from './_components/RolesPermissionsProvider'
import getRolesPermissionsRoles from '@/server/actions/getRolesPermissionsRoles'
import getRolesPermissionsUsers from '@/server/actions/getRolesPermissionsUsers'
import type { PageProps } from '@/@types/common'

export default async function Page({ searchParams }: PageProps) {
    const params = await searchParams

    const roleList = await getRolesPermissionsRoles()
    const userList = await getRolesPermissionsUsers(params)

    return (
        <RolesPermissionsProvider
            roleList={roleList}
            userList={userList.list}
            role={params.role as string}
            status={params.status as string}
        >
            <Container>
                {/*
                    El aviso va en la pagina y no en cada componente porque lo
                    que no existe es la fase entera: los roles, las cuentas y
                    los permisos que se ven aqui salen de datos mock de la
                    plantilla (getRolesPermissionsRoles / ...Users). Sin este
                    cartel, un admin lee la rejilla como el estado real de la
                    autorizacion de su organizacion.
                */}
                <Alert showIcon type="warning" className="mb-6">
                    Roles &amp; permissions is a preview: the roles and the
                    accounts below are sample data from the template. Nothing on
                    this page grants or revokes access.
                </Alert>
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3>Roles & Permissions</h3>
                        <RolesPermissionsGroupsAction />
                    </div>
                    <div className="mb-10">
                        <RolesPermissionsGroups />
                    </div>
                </div>
                <div>
                    <div>
                        <div className="mb-6 flex flex-col gap-5">
                            <h3>All accounts</h3>
                            <div className="flex-1">
                                <RolesPermissionsUserAction />
                            </div>
                        </div>
                        <RolesPermissionsUserTable
                            userListTotal={userList.total}
                            pageIndex={
                                parseInt(params.pageIndex as string) || 1
                            }
                            pageSize={parseInt(params.pageSize as string) || 10}
                        />
                    </div>
                </div>
            </Container>
            <RolesPermissionsAccessDialog />
            <RolesPermissionsUserSelected />
        </RolesPermissionsProvider>
    )
}
