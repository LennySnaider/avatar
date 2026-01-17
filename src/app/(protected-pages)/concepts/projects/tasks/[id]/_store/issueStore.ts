import { create } from 'zustand'
import type { IssueDetail, Members } from '../types'

export type ProjectListState = {
    initialLoading: boolean
    issueData: IssueDetail
    memberList: Members
}

type ProjectListAction = {
    setInitialLoading: (payload: boolean) => void
    updateIssueData: (payload: IssueDetail) => void
    setMembers: (payload: Members) => void
}

const initialState: ProjectListState = {
    initialLoading: true,
    issueData: {
        assignees: [],
        labels: [],
        comments: [],
        attachments: [],
        activity: [],
    },
    memberList: [],
}

export const useIssueStore = create<ProjectListState & ProjectListAction>(
    (set) => ({
        ...initialState,
        updateIssueData: (payload) => set(() => ({ issueData: payload })),
        setMembers: (payload) => set(() => ({ memberList: payload })),
        setInitialLoading: (payload) =>
            set(() => ({ initialLoading: payload })),
    }),
)
