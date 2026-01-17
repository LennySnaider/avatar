import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ProductListProvider from './_components/ProductListProvider'
import ProductListActionTools from './_components/ProductListActionTools'
import ProducListTableTools from './_components/ProducListTableTools'
import ProductListTable from './_components/ProductListTable'
import ProductListSelected from './_components/ProductListSelected'
import getProducts from '@/server/actions/getProducts'
import type { PageProps } from '@/@types/common'

export default async function Page({ searchParams }: PageProps) {
    const params = await searchParams
    const data = await getProducts(params)

    return (
        <ProductListProvider productList={data.list}>
            <Container>
                <AdaptiveCard>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                            <h3>Products</h3>
                            <ProductListActionTools />
                        </div>
                        <ProducListTableTools />
                        <ProductListTable
                            productListTotal={data.total}
                            pageIndex={
                                parseInt(params.pageIndex as string) || 1
                            }
                            pageSize={parseInt(params.pageSize as string) || 10}
                        />
                    </div>
                </AdaptiveCard>
            </Container>
            <ProductListSelected />
        </ProductListProvider>
    )
}
