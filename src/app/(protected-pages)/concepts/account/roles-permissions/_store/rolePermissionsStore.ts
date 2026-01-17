import { create } from 'zustand'
import type { User, Users, Roles, Filter } from '../types'

type Dialog = {
    type: '' | 'edit' | 'new'
    open: boolean
}

export const initialFilterData: Filter = {
    status: '',
    role: '',
}

export type RolePermissionsState = {
    userList: Users
    roleList: Roles
    filterData: Filter
    selectedUser: Users
    selectedRole: string
    roleDialog: Dialog
    initialLoading: boolean
}

type RolePermissionsAction = {
    setFilterData: (payload: Filter) => void
    setSelectedUser: (checked: boolean, customer: User) => void
    setSelectAllUser: (payload: Users) => void
    setSelectedRole: (payload: string) => void
    setRoleDialog: (payload: Dialog) => void
    setRoleList: (payload: Roles) => void
    setUserList: (payload: Users) => void
    setInitialLoading: (payload: boolean) => void
}

const initialState: RolePermissionsState = {
    userList: [],
    roleList: [],
    filterData: initialFilterData,
    selectedUser: [],
    selectedRole: '',
    roleDialog: {
        type: '',
        open: false,
    },
    initialLoading: true,
}

export const useRolePermissionsStore = create<
    RolePermissionsState & RolePermissionsAction
>((set) => ({
    ...initialState,
    setFilterData: (payload) => set(() => ({ filterData: payload })),
    setSelectedUser: (checked, row) =>
        set((state) => {
            const prevData = state.selectedUser
            if (checked) {
                return { selectedUser: [...prevData, ...[row]] }
            } else {
                if (prevData.some((prevUser) => row.id === prevUser.id)) {
                    return {
                        selectedUser: prevData.filter(
                            (prevUser) => prevUser.id !== row.id,
                        ),
                    }
                }
                return { selectedUser: prevData }
            }
        }),
    setSelectAllUser: (payload) => set(() => ({ selectedUser: payload })),
    setSelectedRole: (payload) => set(() => ({ selectedRole: payload })),
    setRoleDialog: (payload) => set(() => ({ roleDialog: payload })),
    setRoleList: (payload) => set(() => ({ roleList: payload })),
    setUserList: (payload) => set(() => ({ userList: payload })),
    setInitialLoading: (payload) => set(() => ({ initialLoading: payload })),
}))
