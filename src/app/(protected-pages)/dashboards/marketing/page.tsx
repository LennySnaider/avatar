import KpiSummary from './_components/KpiSummary'
import RecentCampaign from './_components/RecentCampaign'
import AdsPerformance from './_components/AdsPerformance'
import LeadPerformance from './_components/LeadPerformance'
import getMarketingDashboard from '@/server/actions/getMarketingDashboard'

export default async function Page() {
    const data = await getMarketingDashboard()

    return (
        <div className="flex flex-col gap-4">
            <KpiSummary data={data.kpiSummary} />
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-y-4 xl:gap-x-4">
                <div className="col-span-2">
                    <AdsPerformance data={data.adsPerformance} />
                </div>
                <LeadPerformance data={data.leadPerformance} />
            </div>
            <RecentCampaign data={data.recentCampaign} />
        </div>
    )
}
