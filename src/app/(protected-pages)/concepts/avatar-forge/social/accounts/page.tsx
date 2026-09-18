import Container from '@/components/shared/Container'
import AccountsClient from './_components/AccountsClient'
import { getUploadPostAgency, listAvatarSocialAccounts } from '@/services/SocialService'

export default async function Page() {
    const [accounts, agency] = await Promise.all([listAvatarSocialAccounts(), getUploadPostAgency()])
    const loadError = !accounts.success
        ? (accounts.error ?? null)
        : !agency.success
          ? (agency.error ?? null)
          : null
    return (
        <Container className="py-6">
            <h3 className="mb-1">Social Accounts</h3>
            <p className="text-sm text-gray-500 mb-6">
                Profiles live on the platform&apos;s Upload-Post agency account — create or
                assign one per avatar, then link its social networks
            </p>
            <AccountsClient
                initialAgency={agency.success ? (agency.data ?? null) : null}
                initialAccounts={accounts.success ? (accounts.data ?? []) : []}
                loadError={loadError}
            />
        </Container>
    )
}
