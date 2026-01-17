import ApiService from './ApiService'

export async function apiGetLogs<T, U extends Record<string, unknown>>(
    params: U,
) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/logs',
        method: 'get',
        params,
    })
}
