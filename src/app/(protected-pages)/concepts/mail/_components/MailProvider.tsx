'use client'
import { useEffect } from 'react'
import { useMailStore } from '../_store/mailStore'
import type { CommonProps } from '@/@types/common'
import type { Mail } from '../types'

interface CalendarProviderProps extends CommonProps {
    mailList: Mail[]
}

const MailProvider = ({ children, mailList }: CalendarProviderProps) => {
    const setMailList = useMailStore((state) => state.setMailList)
    const setMailListFetched = useMailStore((state) => state.setMailListFetched)

    useEffect(() => {
        setMailList(mailList)
        setMailListFetched(true)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mailList])

    return <>{children}</>
}

export default MailProvider
