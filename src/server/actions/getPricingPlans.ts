import { pricingPlansData } from '@/mock/data/accountsData'
import sleep from '@/utils/sleep'

const getPricingPlans = async () => {
    await sleep(5)
    return pricingPlansData
}

export default getPricingPlans
