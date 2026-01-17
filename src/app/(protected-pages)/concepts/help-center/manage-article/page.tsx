import Container from '@/components/shared/Container'
import ManageArticleHeader from './_components/ManageArticleHeader'
import ArticleListTable from './_components/ArticleListTable'
import ArticleListSelected from './_components/ArticleListSelected'
import ManageArticleProvider from './_components/ManageArticleProvider'
import getManageArticle from '@/server/actions/getManageArticle'
import type { PageProps } from '@/@types/common'

export default async function Page({ searchParams }: PageProps) {
    const params = await searchParams
    const data = await getManageArticle(params)

    return (
        <ManageArticleProvider
            articleList={data.list}
            articleTotal={data.total}
            category={params.category as string}
        >
            <Container>
                <ManageArticleHeader />
                <ArticleListTable
                    pageIndex={parseInt(params.pageIndex as string) || 1}
                    pageSize={parseInt(params.pageSize as string) || 10}
                />
            </Container>
            <ArticleListSelected />
            <div className="h-6"></div>
        </ManageArticleProvider>
    )
}
