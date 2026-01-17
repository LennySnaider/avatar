'use client'

import Loading from '@/components/shared/Loading'
import dynamic from 'next/dynamic'

const Chart = dynamic(() => import('@/components/shared/Chart'), {
    ssr: false,
    loading: () => (
        <div className="h-[230px] flex items-center justify-center">
            <Loading loading />
        </div>
    ),
})

const Donut = () => {
    const data = {
        labels: ['Item A', 'Item B', 'Item C'],
        values: [15032, 11246, 8273],
        coinSymbol: ['A', 'B', 'C'],
    }

    return (
        <Chart
            donutTitle={`$${data.values.reduce((a, b) => a + b, 0)}`}
            donutText="Assets"
            series={data.values}
            customOptions={{ labels: data.labels }}
            type="donut"
            height={230}
        />
    )
}

export default Donut
