import { ordersData, orderDetailsData } from '@/mock/data/ordersData'

const getOrderDetails = async (_queryParams: {
    [key: string]: string | string[] | undefined
}) => {
    const queryParams = _queryParams

    const { id } = queryParams

    const order = ordersData.find((order) => order.id === id)

    const newOrderDetailsData = structuredClone(orderDetailsData)

    if (order) {
        newOrderDetailsData.id = order.id
        newOrderDetailsData.paymentStatus = order.status
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return newOrderDetailsData as any
}

export default getOrderDetails
