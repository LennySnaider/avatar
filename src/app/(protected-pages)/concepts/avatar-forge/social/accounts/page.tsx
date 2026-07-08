import Container from '@/components/shared/Container'
import AccountsClient from './_components/AccountsClient'
import { getSocialProfileAction } from '@/services/SocialService'

export default async function Page() {
    const profile = await getSocialProfileAction()
    return (
        <Container className="py-6">
            <h3 className="mb-1">Social Accounts</h3>
            <p className="text-sm text-gray-500 mb-6">
                Connect the networks where your avatar content gets published (via Upload-Post)
            </p>
            <AccountsClient
                initialProfile={profile.success ? (profile.data ?? null) : null}
                loadError={profile.success ? null : (profile.error ?? null)}
            />
        </Container>
    )
}
