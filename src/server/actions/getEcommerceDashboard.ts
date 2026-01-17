import { eCommerceData } from '@/mock/data/dashboardData'

async function getEcommerceDashboard() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return eCommerceData as any
}

export default getEcommerceDashboard
