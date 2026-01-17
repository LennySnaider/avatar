'use client'

import Container from '@/components/shared/Container'
import Categories from './Categories'
import ArticleList from './ArticleList'
import { useHelpCenterStore } from '../_store/helpCenterStore'
import type { CategoriesProps } from './Categories'

type BodySectionProps = CategoriesProps

const BodySection = ({ data }: BodySectionProps) => {
    const queryText = useHelpCenterStore((state) => state.queryText)
    const selectedTopic = useHelpCenterStore((state) => state.selectedTopic)

    return (
        <div className="my-12">
            <Container>
                <div className="max-w-[1200px] mx-auto px-6">
                    {queryText || selectedTopic ? (
                        <ArticleList query={queryText} topic={selectedTopic} />
                    ) : (
                        <Categories data={data} />
                    )}
                </div>
            </Container>
        </div>
    )
}

export default BodySection
