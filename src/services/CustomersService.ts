import ApiService from './ApiService'

export async function apiGetCustomerLog<T, U extends Record<string, unknown>>({
    ...params
}: U) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/customers/log`,
        method: 'get',
        params,
    })
}

export async function apiGetCustomers<T, U extends Record<string, unknown>>({
    ...params
}: U) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/customers`,
        method: 'get',
        params,
    })
}
