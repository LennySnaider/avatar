import { analyticsData } from '@/mock/data/dashboardData'

async function getAnalyticDashboard() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return analyticsData as any
}

export default getAnalyticDashboard
