import { userDetailData } from '@/mock/data/usersData'

const getCustomer = async (_queryParams: {
    [key: string]: string | string[] | undefined
}) => {
    const queryParams = _queryParams

    const { id } = queryParams

    const user = userDetailData.find((user) => user.id === id)

    if (!user) {
        return {}
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return user as any
}

export default getCustomer
