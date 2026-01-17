import { marketingData } from '@/mock/data/dashboardData'

async function getMarketingDashboard() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return marketingData as any
}

export default getMarketingDashboard
