import { create } from 'zustand'
import type { Product, Filter } from '../types'

export const initialFilterData = {
    minAmount: 0,
    maxAmount: 5000,
    productStatus: 'published',
    productType: ['Bags', 'Cloths', 'Devices', 'Shoes', 'Watches'],
}

export type ProductsListState = {
    initialLoading: boolean
    productList: Product[]
    filterData: Filter
    selectedProduct: Partial<Product>[]
}

type ProductsListAction = {
    setFilterData: (payload: Filter) => void
    setSelectedProduct: (checked: boolean, customer: Product) => void
    setSelectAllProduct: (customer: Product[]) => void
    setProductList: (productList: Product[]) => void
    setInitialLoading: (payload: boolean) => void
}

const initialState: ProductsListState = {
    initialLoading: true,
    productList: [],
    filterData: initialFilterData,
    selectedProduct: [],
}

export const useProductListStore = create<
    ProductsListState & ProductsListAction
>((set) => ({
    ...initialState,
    setFilterData: (payload) => set(() => ({ filterData: payload })),
    setSelectedProduct: (checked, row) =>
        set((state) => {
            const prevData = state.selectedProduct
            if (checked) {
                return { selectedProduct: [...prevData, ...[row]] }
            } else {
                if (prevData.some((prevProduct) => row.id === prevProduct.id)) {
                    return {
                        selectedProduct: prevData.filter(
                            (prevProduct) => prevProduct.id !== row.id,
                        ),
                    }
                }
                return { selectedProduct: prevData }
            }
        }),
    setSelectAllProduct: (row) => set(() => ({ selectedProduct: row })),
    setProductList: (productList) => set(() => ({ productList })),
    setInitialLoading: (payload) => set(() => ({ initialLoading: payload })),
}))
