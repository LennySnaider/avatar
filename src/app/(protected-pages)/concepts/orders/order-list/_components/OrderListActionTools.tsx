'use client'

import Button from '@/components/ui/Button'
import { useOrderListStore } from '../_store/orderListStore'
import { TbCloudDownload, TbPlus } from 'react-icons/tb'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

const CSVLink = dynamic(() => import('react-csv').then((mod) => mod.CSVLink), {
    ssr: false,
})

const OrderListActionTools = () => {
    const router = useRouter()

    const orderList = useOrderListStore((state) => state.orderList)

    return (
        <div className="flex flex-col md:flex-row gap-3">
            <CSVLink
                className="w-full"
                filename="customerList.csv"
                data={orderList}
            >
                <Button
                    icon={<TbCloudDownload className="text-xl" />}
                    className="w-full"
                >
                    Download
                </Button>
            </CSVLink>
            <Button
                variant="solid"
                icon={<TbPlus className="text-xl" />}
                onClick={() => router.push('/concepts/orders/order-create')}
            >
                Add new
            </Button>
        </div>
    )
}

export default OrderListActionTools
