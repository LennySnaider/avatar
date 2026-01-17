import Card from '@/components/ui/Card'
import Plans from './_components/Plans'
import PaymentCycleToggle from './_components/PaymentCycleToggle'
import Faq from './_components/Faq'
import PaymentDialog from './_components/PaymentDialog'
import getPricingPlans from '@/server/actions/getPricingPlans'
import type { PageProps } from '@/@types/common'

export default async function Page({ searchParams }: PageProps) {
    const params = await searchParams
    const data = await getPricingPlans()

    return (
        <>
            <Card className="mb-4">
                <div className="flex items-center justify-between mb-8">
                    <h3>Pricing</h3>
                    <PaymentCycleToggle />
                </div>
                <Plans
                    data={data}
                    subcription={params.subcription as string}
                    cycle={params.cycle as string}
                />
            </Card>
            <Faq />
            <PaymentDialog />
        </>
    )
}
