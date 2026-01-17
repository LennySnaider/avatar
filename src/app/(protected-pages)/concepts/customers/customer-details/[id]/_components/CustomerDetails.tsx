'use client'

import Card from '@/components/ui/Card'
import Tabs from '@/components/ui/Tabs'
import ProfileSection from './ProfileSection'
import BillingSection from './BillingSection'
import ActivitySection from './ActivitySection'
import type { Customer } from '../types'

type CustomerDetailsProps = {
    data: Customer
}

const { TabNav, TabList, TabContent } = Tabs

const CustomerDetails = ({ data }: CustomerDetailsProps) => {
    return (
        <div className="flex flex-col xl:flex-row gap-4">
            <div className="min-w-[330px] 2xl:min-w-[400px]">
                <ProfileSection data={data} />
            </div>
            <Card className="w-full">
                <Tabs defaultValue="billing">
                    <TabList>
                        <TabNav value="billing">Billing</TabNav>
                        <TabNav value="activity">Activity</TabNav>
                    </TabList>
                    <div className="p-4">
                        <TabContent value="billing">
                            <BillingSection data={data} />
                        </TabContent>
                        <TabContent value="activity">
                            <ActivitySection
                                customerName={data.name}
                                id={data.id}
                            />
                        </TabContent>
                    </div>
                </Tabs>
            </Card>
        </div>
    )
}

export default CustomerDetails
