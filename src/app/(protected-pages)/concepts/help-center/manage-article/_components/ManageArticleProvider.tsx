'use client'
import { useEffect } from 'react'
import {
    useManageArticleStore,
    initialFilterData,
} from '../_store/manageArticleStore'
import type { CommonProps } from '@/@types/common'
import type { Article } from '../types'

interface ManageArticleProviderProps extends CommonProps {
    articleList: Article[]
    articleTotal: number
    category?: string
}

const ManageArticleProvider = ({
    children,
    articleList,
    articleTotal,
    category,
}: ManageArticleProviderProps) => {
    const setArticleList = useManageArticleStore(
        (state) => state.setArticleList,
    )
    const setArticleTotal = useManageArticleStore(
        (state) => state.setArticleTotal,
    )
    const setFilterData = useManageArticleStore((state) => state.setFilterData)
    const setLoading = useManageArticleStore((state) => state.setLoading)

    useEffect(() => {
        if (category) {
            const initialCategory = category.split(',')
            const validatedCategory = initialFilterData.category.filter(
                (item) => initialCategory.includes(item),
            )
            setFilterData({ category: validatedCategory })
        }

        setArticleList(articleList)
        setArticleTotal(articleTotal)
        setLoading(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [articleList, articleTotal])

    return <>{children}</>
}

export default ManageArticleProvider
