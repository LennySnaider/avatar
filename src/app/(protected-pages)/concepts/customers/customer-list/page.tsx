import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import CustomerListProvider from './_components/CustomerListProvider'
import CustomerListTable from './_components/CustomerListTable'
import CustomerListActionTools from './_components/CustomerListActionTools'
import CustomersListTableTools from './_components/CustomersListTableTools'
import CustomerListSelected from './_components/CustomerListSelected'
import getCustomers from '@/server/actions/getCustomers'
import type { PageProps } from '@/@types/common'

export default async function Page({ searchParams }: PageProps) {
    const params = await searchParams
    const data = await getCustomers(params)

    return (
        <CustomerListProvider customerList={data.list}>
            <Container>
                <AdaptiveCard>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                            <h3>Customers</h3>
                            <CustomerListActionTools />
                        </div>
                        <CustomersListTableTools />
                        <CustomerListTable
                            customerListTotal={data.total}
                            pageIndex={
                                parseInt(params.pageIndex as string) || 1
                            }
                            pageSize={parseInt(params.pageSize as string) || 10}
                        />
                    </div>
                </AdaptiveCard>
            </Container>
            <CustomerListSelected />
        </CustomerListProvider>
    )
}
