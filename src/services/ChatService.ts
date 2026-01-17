import ApiService from './ApiService'

export async function apiGetConversation<T>({ id }: { id: string }) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/conversations/${id}`,
        method: 'get',
    })
}

export async function apiGetContacts<T>() {
    return ApiService.fetchDataWithAxios<T>({
        url: `/contacts`,
        method: 'get',
    })
}

export async function apiGetContactDetails<T>({ id }: { id: string }) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/contacts/${id}`,
        method: 'get',
    })
}
