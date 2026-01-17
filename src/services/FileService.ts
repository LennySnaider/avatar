import ApiService from './ApiService'

export async function apiGetFiles<T, U extends Record<string, unknown>>(
    params: U,
) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/files',
        method: 'get',
        params,
    })
}
