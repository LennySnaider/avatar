'use client'

import { useState } from 'react'
import AnalyticHeader from './AnalyticHeader'
import Metrics from './Metrics'
import WebAnalytic from './AnalyticChart'
import Traffic from './Traffic'
import TopChannel from './TopChannel'
import DeviceSession from './DeviceSession'
import TopPerformingPages from './TopPerformingPages'
import type { AnalyticDashboardData, Period } from '../types'

type AnalyticDashboardProps = {
    data: AnalyticDashboardData
}

const AnalyticDashboard = ({ data }: AnalyticDashboardProps) => {
    const [selectedPeriod, setSelectedPeriod] = useState<Period>('thisMonth')

    return (
        <div className="flex flex-col gap-4">
            <AnalyticHeader
                selectedPeriod={selectedPeriod}
                onSelectedPeriodChange={setSelectedPeriod}
            />
            <div className="flex flex-col 2xl:grid grid-cols-4 gap-4">
                <div className="col-span-4 2xl:col-span-3">
                    <WebAnalytic data={data[selectedPeriod].webAnalytic} />
                </div>
                <div className="2xl:col-span-1">
                    <Metrics
                        data={data[selectedPeriod].metrics}
                        selectedPeriod={selectedPeriod}
                    />
                </div>
            </div>
            <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 md:col-span-6 xl:col-span-4">
                    <TopPerformingPages data={data[selectedPeriod].topPages} />
                </div>
                <div className="col-span-12 md:col-span-6 xl:col-span-4">
                    <DeviceSession data={data[selectedPeriod].deviceSession} />
                </div>
                <div className="col-span-12 xl:col-span-4">
                    <TopChannel data={data[selectedPeriod].topChannel} />
                </div>
                <div className="col-span-12">
                    <Traffic data={data[selectedPeriod].traffic} />
                </div>
            </div>
        </div>
    )
}

export default AnalyticDashboard
