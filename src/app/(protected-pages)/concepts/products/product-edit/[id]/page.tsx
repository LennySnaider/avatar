import ProductEdit from './_components/ProductEdit'
import NoProductFound from '@/assets/svg/NoProductFound'
import getProduct from '@/server/actions/getProduct'
import isEmpty from 'lodash/isEmpty'

export default async function Page(props: { params: Promise<{ id: string }> }) {
    const params = await props.params

    const data = await getProduct(params)

    if (isEmpty(data)) {
        return (
            <div className="h-full flex flex-col items-center justify-center">
                <NoProductFound height={280} width={280} />
            </div>
        )
    }

    return <ProductEdit data={data} />
}
