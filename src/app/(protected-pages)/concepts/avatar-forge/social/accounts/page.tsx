import Container from '@/components/shared/Container'
import AccountsClient from './_components/AccountsClient'
import { listAvatarSocialAccounts } from '@/services/SocialService'

export default async function Page() {
    const accounts = await listAvatarSocialAccounts()
    return (
        <Container className="py-6">
            <h3 className="mb-1">Social Accounts</h3>
            <p className="text-sm text-gray-500 mb-6">
                Each avatar posts through its own Upload-Post account — paste that
                account&apos;s API key on the avatar&apos;s card, then link its social networks
            </p>
            <AccountsClient
                initialAccounts={accounts.success ? (accounts.data ?? []) : []}
                loadError={accounts.success ? null : (accounts.error ?? null)}
            />
        </Container>
    )
}
