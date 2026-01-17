import { mailData } from '@/mock/data/mailData'

const getMail = async (_queryParams: {
    [key: string]: string | string[] | undefined
}) => {
    const queryParams = _queryParams

    const { mail: id } = queryParams

    const mail = mailData.find((mail) => mail.id === id)

    if (!mail) {
        return {}
    }

    return mail
}

export default getMail
