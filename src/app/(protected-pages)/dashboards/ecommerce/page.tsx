import Overview from './_components/Overview'
import CustomerDemographic from './_components/CustomerDemographic'
import RecentOrder from './_components/RecentOrder'
import SalesTarget from './_components/SalesTarget'
import TopProduct from './_components/TopProduct'
import RevenueByChannel from './_components/RevenueByChannel'
import getEcommerceDashboard from '@/server/actions/getEcommerceDashboard'

export default async function Page() {
    const data = await getEcommerceDashboard()
    return (
        <div>
            <div className="flex flex-col gap-4 max-w-full overflow-x-hidden">
                <div className="flex flex-col xl:flex-row gap-4">
                    <div className="flex flex-col gap-4 flex-1 xl:col-span-3">
                        <Overview data={data.statisticData} />
                        <CustomerDemographic data={data.customerDemographic} />
                    </div>
                    <div className="flex flex-col gap-4 2xl:min-w-[360px]">
                        <SalesTarget data={data.salesTarget} />
                        <TopProduct data={data.topProduct} />
                        <RevenueByChannel data={data.revenueByChannel} />
                    </div>
                </div>

                <RecentOrder data={data.recentOrders} />
            </div>
        </div>
    )
}
