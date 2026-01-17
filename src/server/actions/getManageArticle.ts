import { articleList } from '@/mock/data/helpCenterData'
import wildCardSearch from '@/utils/wildCardSearch'
import sortBy, { Primer } from '@/utils/sortBy'
import paginate from '@/utils/paginate'

const getManageArticle = async (_queryParams: {
    [key: string]: string | string[] | undefined
}) => {
    const queryParams = _queryParams

    const {
        pageIndex = '1',
        pageSize = '10',
        sortKey = '',
        order,
        query,
    } = queryParams

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const articles = articleList.getList() as any[]

    let data = structuredClone(articles)
    let total = articles.length

    if (sortKey) {
        if (sortKey !== 'updateTimeStamp') {
            data.sort(
                sortBy((sortKey || '') as string, order === 'desc', (a) =>
                    (a as string).toUpperCase(),
                ),
            )
        } else {
            data.sort(sortBy(sortKey, order === 'desc', parseInt as Primer))
        }
    }

    if (query) {
        data = wildCardSearch(data, query as string)
        total = data.length
    }

    if ('category' in queryParams && queryParams.category) {
        const categories = (queryParams.category as string).split(',')
        data = data.filter((article) => categories.includes(article.category))
    }

    data = paginate(
        data,
        parseInt(pageSize as string),
        parseInt(pageIndex as string),
    )

    return {
        list: data,
        total: total,
    }
}

export default getManageArticle
