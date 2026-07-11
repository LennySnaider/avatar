import Container from '@/components/shared/Container'
import FanvueAccountsClient from './_components/FanvueAccountsClient'
import {
    getFanvueConnection,
    listFanvueCreators,
} from '@/services/FanvueService'

export default async function Page() {
    const [connection, creators] = await Promise.all([
        getFanvueConnection(),
        listFanvueCreators(),
    ])

    return (
        <Container className="py-6">
            <h3 className="mb-1">Fanvue Agency</h3>
            <p className="text-sm text-gray-500 mb-6">
                Connect your Fanvue agency and publish avatar media on behalf of
                your managed creators
            </p>
            <FanvueAccountsClient
                initialConnection={
                    connection.success ? (connection.data ?? null) : null
                }
                initialCreators={creators.success ? (creators.data ?? []) : []}
                loadError={
                    connection.success ? null : (connection.error ?? null)
                }
            />
        </Container>
    )
}
