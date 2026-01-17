'use client'

import Loading from '@/components/shared/Loading'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import IssueHeader from './IssueHeader'
import IssueBody from './IssueBody'
import IssueFooter from './IssueFooter'
import IssueActivity from './IssueActivity'
import { useIssueStore } from '../_store/issueStore'

const Issue = () => {
    const initialLoading = useIssueStore((state) => state.initialLoading)
    return (
        <AdaptiveCard>
            <Loading loading={initialLoading}>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <div className="lg:col-span-2">
                        <div className="px-6">
                            <IssueHeader />
                            <div className="mt-8">
                                <IssueBody />
                            </div>
                            <div className="mt-8">
                                <IssueFooter />
                            </div>
                        </div>
                    </div>
                    <div>
                        <IssueActivity />
                    </div>
                </div>
            </Loading>
        </AdaptiveCard>
    )
}

export default Issue
