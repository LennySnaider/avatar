import ArticleBody from './_components/ArticleBody'
import ArticleAction from './_components/ArticleAction'
import ArticleTableOfContent from './_components/ArticleTableOfContent'
import NotFound from '@/components/shared/NotFound'
import getArticle from '@/server/actions/getArticle'
import isEmpty from 'lodash/isEmpty'
import type { CommonProps } from '@/@types/common'

export default async function Page(props: {
    params: Promise<CommonProps & { id: string }>
}) {
    const params = await props.params

    const data = await getArticle(params.id)

    if (isEmpty(data)) {
        return (
            <div className="h-full flex flex-col items-center justify-center">
                <NotFound message="No article found!" />
            </div>
        )
    }

    return (
        <>
            <div className="my-6 max-w-[800px] w-full mx-auto">
                <ArticleBody data={data} />
                <ArticleAction />
            </div>
            <ArticleTableOfContent content={data.tableOfContent} />
        </>
    )
}
