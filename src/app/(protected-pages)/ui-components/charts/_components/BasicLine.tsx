import dynamic from 'next/dynamic'
import { COLOR_2 } from '@/constants/chart.constant'

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false })

const BasicLine = () => {
    const data = [
        {
            name: 'Desktops',
            data: [10, 41, 35, 51, 49, 62, 69, 91, 148],
        },
    ]

    return (
        <Chart
            options={{
                chart: {
                    type: 'line',
                    zoom: {
                        enabled: false,
                    },
                },
                dataLabels: {
                    enabled: false,
                },
                stroke: {
                    curve: 'smooth',
                    width: 3,
                },
                colors: [COLOR_2],
                xaxis: {
                    categories: [
                        'Jan',
                        'Feb',
                        'Mar',
                        'Apr',
                        'May',
                        'Jun',
                        'Jul',
                        'Aug',
                        'Sep',
                    ],
                },
            }}
            type="line"
            series={data}
            height={300}
        />
    )
}

export default BasicLine
