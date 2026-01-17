import dynamic from 'next/dynamic'
import { COLORS } from '@/constants/chart.constant'

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false })

const SimplePie = () => {
    return (
        <Chart
            options={{
                colors: COLORS,
                labels: ['Team A', 'Team B', 'Team C', 'Team D', 'Team E'],
                responsive: [
                    {
                        breakpoint: 480,
                        options: {
                            chart: {
                                width: 200,
                            },
                            legend: {
                                position: 'bottom',
                            },
                        },
                    },
                ],
            }}
            series={[44, 55, 13, 43, 22]}
            height={300}
            type="pie"
        />
    )
}

export default SimplePie
