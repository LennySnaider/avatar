import { mailData } from '@/mock/data/mailData'

const getMailList = async (_queryParams: {
    [key: string]: string | string[] | undefined
}) => {
    const queryParams = _queryParams

    const { category, label } = queryParams

    let response = mailData

    if (category && category !== 'inbox') {
        response = mailData.filter((mail) => mail.group === category)
    }

    if (label) {
        response = mailData.filter((mail) => mail.label === label)
    }

    return response
}

export default getMailList
