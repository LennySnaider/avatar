import ApiService from './ApiService'

export async function apiGetSupportHubArticles<
    T,
    U extends Record<string, unknown>,
>(params: U) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/helps/articles',
        method: 'get',
        params,
    })
}

export async function apiDeleteSupportHubArticles<
    T,
    U extends Record<string, unknown>,
>(data: U) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/helps/articles',
        method: 'delete',
        data,
    })
}
