import { roleGroupsData } from '@/mock/data/accountsData'
import { userDetailData } from '@/mock/data/usersData'

const getRolesPermissionsRoles = async () => {
    const users = userDetailData

    const roleGroup = roleGroupsData.map((group) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        group.users = users.filter((user) => user.role === group.id) as any
        return group
    })

    return roleGroup
}

export default getRolesPermissionsRoles
