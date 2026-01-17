import { articleListData, articleDetailData } from '@/mock/data/helpCenterData'

const getArticle = async (id: string) => {
    const article = articleListData.find((article) => article.id === id)

    if (!article) {
        return null
    }

    return { ...article, ...articleDetailData }
}

export default getArticle
