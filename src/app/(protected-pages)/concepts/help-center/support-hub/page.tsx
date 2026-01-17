import TopSection from './_components/TopSection'
import BodySection from './_components/BodySection'
import getArticle from '@/server/actions/getArticleCategories'

export default async function Page() {
    const data = await getArticle()

    return (
        <>
            <TopSection />
            <BodySection data={data} />
        </>
    )
}
