'use client'

import AdaptiveCard from '@/components/shared/AdaptiveCard'
import MailList from './MailList'
import MailSidebar from './MailSidebar'
import MailDetail from './MailDetail'
import MailBodyTop from './MailBodyTop'
import isEmpty from 'lodash/isEmpty'
import type { Mail } from '../types'

type MailBodyProps = {
    mail: Mail
}

const MailBody = ({ mail }: MailBodyProps) => {
    return (
        <AdaptiveCard
            className="h-full border-0"
            bodyClass="h-full flex flex-col"
        >
            <div className="flex flex-auto h-full">
                <MailSidebar />
                <div className="lg:ltr:pl-6 lg:rtl:pr-6 flex-1">
                    <MailBodyTop />
                    <div className="relative h-[calc(100%-70px)]">
                        {isEmpty(mail) ? (
                            <MailList />
                        ) : (
                            <MailDetail mail={mail} />
                        )}
                    </div>
                </div>
            </div>
        </AdaptiveCard>
    )
}

export default MailBody
