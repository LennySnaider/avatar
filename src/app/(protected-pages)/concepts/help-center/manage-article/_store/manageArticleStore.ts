import { create } from 'zustand'
import type { Article, Articles, Filter } from '../types'

export const initialFilterData = {
    category: [
        'introduction',
        'setupGuide',
        'basicFeatures',
        'survey',
        'analytic',
        'dataVisualization',
        'chatbot',
        'media',
        'security',
        'integration',
        'themes',
        'commission',
    ],
}

export type ManageArticleState = {
    loading: boolean
    articleList: Articles
    filterData: Filter
    articleTotal: number
    selectedArticle: Partial<Article>[]
}

type ManageArticleAction = {
    setFilterData: (payload: Filter) => void
    setArticleList: (articleList: Articles) => void
    setArticleTotal: (articleTotal: number) => void
    setSelectedArticle: (checked: boolean, customer: Article) => void
    setSelectAllArticle: (customer: Articles) => void
    setLoading: (loading: boolean) => void
}

const initialState: ManageArticleState = {
    loading: true,
    articleList: [],
    articleTotal: 0,
    selectedArticle: [],
    filterData: initialFilterData,
}

export const useManageArticleStore = create<
    ManageArticleState & ManageArticleAction
>((set) => ({
    ...initialState,
    setFilterData: (payload) => set(() => ({ filterData: payload })),
    setArticleList: (articleList) => set(() => ({ articleList })),
    setArticleTotal: (articleTotal) => set(() => ({ articleTotal })),
    setSelectedArticle: (checked, row) =>
        set((state) => {
            const prevData = state.selectedArticle
            if (checked) {
                return { selectedArticle: [...prevData, ...[row]] }
            } else {
                if (prevData.some((prevArticle) => row.id === prevArticle.id)) {
                    return {
                        selectedArticle: prevData.filter(
                            (prevArticle) => prevArticle.id !== row.id,
                        ),
                    }
                }
                return { selectedArticle: prevData }
            }
        }),
    setSelectAllArticle: (row) => set(() => ({ selectedArticle: row })),
    setLoading: (loading) => set(() => ({ loading })),
}))
