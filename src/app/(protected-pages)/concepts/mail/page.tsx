import MailEditor from './_components/MailEditor'
import MailProvider from './_components/MailProvider'
import MailBody from './_components/MailBody'
import getMail from '@/server/actions/getMail'
import getMailList from '@/server/actions/getMailList'
import type { PageProps } from '@/@types/common'
import type { Mail } from './types'

export default async function Page({ searchParams }: PageProps) {
    const params = await searchParams

    const mail = await getMail(params)
    const mailList = await getMailList(params)

    return (
        <MailProvider mailList={mailList as unknown as Mail[]}>
            <MailBody mail={mail as Mail} />
            <MailEditor />
        </MailProvider>
    )
}
