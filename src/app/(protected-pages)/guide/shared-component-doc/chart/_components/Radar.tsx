'use client'

import Loading from '@/components/shared/Loading'
import dynamic from 'next/dynamic'

const Chart = dynamic(() => import('@/components/shared/Chart'), {
    ssr: false,
    loading: () => (
        <div className="h-[400px] flex items-center justify-center">
            <Loading loading />
        </div>
    ),
})
const Radar = () => {
    const chartData = {
        series: [
            {
                name: 'Series 1',
                data: [80, 50, 30, 40, 100, 20],
            },
        ],
        categories: ['January', 'February', 'March', 'April', 'May', 'June'],
    }
    return (
        <Chart
            type="radar"
            series={chartData.series}
            xAxis={chartData.categories}
            height={400}
        />
    )
}

export default Radar
