import ApiService from './ApiService'

export async function apiGetScrumBoards<T>() {
    return ApiService.fetchDataWithAxios<T>({
        url: '/projects/scrum-board',
        method: 'get',
    })
}

export async function apiGetProjectMembers<T>() {
    return ApiService.fetchDataWithAxios<T>({
        url: '/projects/scrum-board/members',
        method: 'get',
    })
}

export async function apiGetProject<T, U extends Record<string, unknown>>({
    id,
    ...params
}: U) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/projects/${id}`,
        method: 'get',
        params,
    })
}
