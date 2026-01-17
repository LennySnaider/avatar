'use client'

import ActionButton from './ActionButton'
import { useMailStore } from '../_store/mailStore'
import { TbArrowLeft } from 'react-icons/tb'
import { useRouter, useSearchParams } from 'next/navigation'

const MailDetailTitle = () => {
    const mail = useMailStore((state) => state.mail)

    const router = useRouter()

    const searchParams = useSearchParams()

    const handleBackButtonClick = () => {
        if (searchParams.get('mail')) {
            const param: Record<string, string> = {}

            const params = ['label', 'category']

            params.forEach((key) => {
                if (searchParams.get(key)) {
                    param[key] = searchParams.get(key) as string
                }
            })

            router.push(
                `/concepts/mail?${new URLSearchParams(param).toString()}`,
            )
        }
    }

    return (
        <div className="flex items-center gap-2">
            <ActionButton onClick={handleBackButtonClick}>
                <TbArrowLeft />
            </ActionButton>
            <h4>{mail?.title}</h4>
        </div>
    )
}

export default MailDetailTitle
