import { productsData } from '@/mock/data/productData'

const getProduct = async (_queryParams: {
    [key: string]: string | string[] | undefined
}) => {
    const queryParams = _queryParams

    const { id } = queryParams
    const product = productsData.find((product) => product.id === id)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return product as any
}

export default getProduct
