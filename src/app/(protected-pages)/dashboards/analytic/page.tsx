import AnalyticDashboard from './_components/AnalyticDashboard'
import getAnalyticDashboard from '@/server/actions/getAnalyticDashboard'

export default async function Page() {
    const data = await getAnalyticDashboard()

    return <AnalyticDashboard data={data} />
}
