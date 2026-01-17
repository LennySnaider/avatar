import { create } from 'zustand'
import type { Orders, Filter } from '../types'
import dayjs from 'dayjs'

export const initialFilterData = {
    date: [dayjs().subtract(1, 'week').toDate(), new Date()] as [Date, Date],
    status: 'all',
    paymentMethod: ['Credit card', 'Debit card', 'Paypal', 'Stripe', 'Cash'],
}

export type OrderListState = {
    filterData: Filter
    orderList: Orders
    initialLoading: boolean
}

type OrderListAction = {
    setFilterData: (payload: Filter) => void
    setOrderList: (payload: Orders) => void
    setInitialLoading: (payload: boolean) => void
}

const initialState: OrderListState = {
    filterData: initialFilterData,
    orderList: [],
    initialLoading: true,
}

export const useOrderListStore = create<OrderListState & OrderListAction>(
    (set) => ({
        ...initialState,
        setFilterData: (payload) => set(() => ({ filterData: payload })),
        setOrderList: (payload) => set(() => ({ orderList: payload })),
        setInitialLoading: (payload) =>
            set(() => ({ initialLoading: payload })),
    }),
)
