import { ordersData } from '@/mock/data/ordersData'
import wildCardSearch from '@/utils/wildCardSearch'
import sortBy, { Primer } from '@/utils/sortBy'
import paginate from '@/utils/paginate'

const getOrderList = async (_queryParams: {
    [key: string]: string | string[] | undefined
}) => {
    const queryParams = _queryParams

    const {
        pageIndex = '1',
        pageSize = '10',
        sortKey = '',
        order,
        query,
    } = queryParams

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orders = ordersData as any[]

    let data = structuredClone(orders)
    let total = orders.length

    if (sortKey) {
        if (sortKey === 'paymentMehod') {
            data.sort(
                sortBy((sortKey || '') as string, order === 'desc', (a) =>
                    (a as string).toUpperCase(),
                ),
            )
        } else {
            data.sort(
                sortBy(sortKey as string, order === 'desc', parseInt as Primer),
            )
        }
    }

    if (query) {
        data = wildCardSearch(data, query as string, 'id')
        total = data.length
    }

    data = paginate(
        data,
        parseInt(pageSize as string),
        parseInt(pageIndex as string),
    )

    return {
        list: data,
        total: total,
    }
}

export default getOrderList
