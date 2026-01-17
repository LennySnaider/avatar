'use client'

import { useEffect } from 'react'
import { useOrderListStore } from '../_store/orderListStore'
import type { Orders } from '../types'
import type { CommonProps } from '@/@types/common'

interface OrderListProviderProps extends CommonProps {
    orderList: Orders
}

const OrderListProvider = ({ orderList, children }: OrderListProviderProps) => {
    const setOrderList = useOrderListStore((state) => state.setOrderList)

    const setInitialLoading = useOrderListStore(
        (state) => state.setInitialLoading,
    )

    useEffect(() => {
        setOrderList(orderList)

        setInitialLoading(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderList])

    return <>{children}</>
}

export default OrderListProvider
