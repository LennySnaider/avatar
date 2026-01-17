import OrderDetailProducts from './_components/OrderDetailProducts'
import OrderDetailPayment from './_components/OrderDetailPayment'
import OrderDetailCustomer from './_components/OrderDetailCustomer'
import OrderDetailsActivities from './_components/OrderDetailsActivities'
import OrderDetailNote from './_components/OrderDetailNote'
import NotFound from '@/components/shared/NotFound'
import getOrderDetails from '@/server/actions/getOrderDetails'
import isEmpty from 'lodash/isEmpty'
import type { Products } from './types'

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

    return (
        <div className="flex flex-col lg:flex-row gap-4">
            <div className="gap-4 flex flex-col flex-auto">
                <OrderDetailProducts products={data.product as Products} />
                <OrderDetailPayment
                    paymentStatus={data.paymentStatus}
                    paymentSummary={data.paymentSummary}
                />
                <OrderDetailsActivities
                    activities={data.activity}
                    progressStatus={data.progressStatus}
                />
            </div>
            <div className="lg:w-[320px] xl:w-[420px] gap-4 flex flex-col">
                <OrderDetailCustomer customer={data.customer} />
                <OrderDetailNote note={data.note} />
            </div>
        </div>
    )
}
