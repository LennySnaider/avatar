import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import OrderListTable from './_components/OrderListTable'
import OrderListActionTools from './_components/OrderListActionTools'
import OrderListTableTools from './_components/OrderListTableTools'
import OrderListProvider from './_components/OrderListProvider'
import getOrderList from '@/server/actions/getOrderList'
import type { PageProps } from '@/@types/common'

export default async function Page({ searchParams }: PageProps) {
    const params = await searchParams
    const data = await getOrderList(params)

    return (
        <OrderListProvider orderList={data.list}>
            <Container>
                <AdaptiveCard>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                            <h3>Orders</h3>
                            <OrderListActionTools />
                        </div>
                        <OrderListTableTools />
                        <OrderListTable
                            orderListTotal={data.total}
                            pageIndex={
                                parseInt(params.pageIndex as string) || 1
                            }
                            pageSize={parseInt(params.pageSize as string) || 10}
                        />
                    </div>
                </AdaptiveCard>
            </Container>
        </OrderListProvider>
    )
}
