'use client'

import Button from '@/components/ui/Button'
import { useRolePermissionsStore } from '../_store/rolePermissionsStore'
import Skeleton from '@/components/ui/Skeleton'
import UsersAvatarGroup from '@/components/shared/UsersAvatarGroup'
import { TbArrowRight } from 'react-icons/tb'

const RolesPermissionsGroups = () => {
    const roleList = useRolePermissionsStore((state) => state.roleList)
    const setRoleDialog = useRolePermissionsStore(
        (state) => state.setRoleDialog,
    )
    const setSelectedRole = useRolePermissionsStore(
        (state) => state.setSelectedRole,
    )
    const initialLoading = useRolePermissionsStore(
        (state) => state.initialLoading,
    )

    const handleEditRoleClick = (id: string) => {
        setSelectedRole(id)
        setRoleDialog({
            type: 'edit',
            open: true,
        })
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {initialLoading && roleList.length === 0 ? (
                <>
                    {Array.from({ length: 4 }).map((_, index) => (
                        <div
                            key={index}
                            className="flex flex-col justify-between rounded-2xl p-5 bg-gray-100 dark:bg-gray-700 min-h-[140px]"
                        >
                            <div className="flex flex-auto flex-col justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <div>
                                        <Skeleton
                                            variant="circle"
                                            height={35}
                                            width={35}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-4 w-full">
                                        <Skeleton height={10} />
                                        <Skeleton height={10} width="60%" />
                                    </div>
                                </div>
                                <div className="flex justify-between">
                                    <div>
                                        <Skeleton
                                            variant="circle"
                                            height={20}
                                            width={20}
                                        />
                                    </div>
                                    <Skeleton height={10} width="30%" />
                                </div>
                            </div>
                        </div>
                    ))}
                </>
            ) : (
                roleList.map((role) => (
                    <div
                        key={role.id}
                        className="flex flex-col justify-between rounded-2xl p-5 bg-gray-100 dark:bg-gray-700 min-h-[140px]"
                    >
                        <div className="flex items-center justify-between">
                            <h6 className="font-bold">{role.name}</h6>
                        </div>
                        <p className="mt-2">{role.description}</p>
                        <div className="flex items-center justify-between mt-4">
                            <div className="flex flex-col">
                                <div className="-ml-2">
                                    <UsersAvatarGroup
                                        avatarProps={{
                                            className:
                                                'cursor-pointer -mr-2 border-2 border-white dark:border-gray-500',
                                            size: 28,
                                        }}
                                        avatarGroupProps={{ maxCount: 3 }}
                                        chained={false}
                                        users={role.users}
                                    />
                                </div>
                            </div>
                            <Button
                                variant="plain"
                                size="sm"
                                className="py-0 h-auto"
                                icon={<TbArrowRight />}
                                iconAlignment="end"
                                onClick={() => handleEditRoleClick(role.id)}
                            >
                                Edit role
                            </Button>
                        </div>
                    </div>
                ))
            )}
        </div>
    )
}

export default RolesPermissionsGroups
