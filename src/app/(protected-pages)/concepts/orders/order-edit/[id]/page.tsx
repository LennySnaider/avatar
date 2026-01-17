import OrderEdit from './_components/OrderEdit'
import NotFound from '@/components/shared/NotFound'
import getOrderDetails from '@/server/actions/getOrderDetails'
import isEmpty from 'lodash/isEmpty'
import type { OrderDetails } from './_components/OrderEdit'

export default async function Page(props: { params: Promise<{ id: string }> }) {
    const params = await props.params

    const data = await getOrderDetails(params)

    if (isEmpty(data)) {
        return (
            <div className="h-full flex flex-col items-center justify-center">
                <NotFound message="No order found!" />
            </div>
        )
    }

    return <OrderEdit data={data as OrderDetails} />
}
