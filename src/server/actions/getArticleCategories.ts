import { articleListData, categoriesData } from '@/mock/data/helpCenterData'

const getArticleCategories = async () => {
    return {
        categories: categoriesData,
        popularArticles: articleListData.filter((article) => article.starred),
    }
}

export default getArticleCategories
