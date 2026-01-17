'use client'

import Button from '@/components/ui/Button'
import { TbCloudDownload, TbPlus } from 'react-icons/tb'
import { useRouter } from 'next/navigation'
import { useProductListStore } from '../_store/productListStore'
import dynamic from 'next/dynamic'

const CSVLink = dynamic(() => import('react-csv').then((mod) => mod.CSVLink), {
    ssr: false,
})

const ProductListActionTools = () => {
    const router = useRouter()

    const productList = useProductListStore((state) => state.productList)

    return (
        <div className="flex flex-col md:flex-row gap-3">
            <CSVLink filename="product-list.csv" data={productList}>
                <Button icon={<TbCloudDownload className="text-xl" />}>
                    Export
                </Button>
            </CSVLink>
            <Button
                variant="solid"
                icon={<TbPlus className="text-xl" />}
                onClick={() => router.push('/concepts/products/product-create')}
            >
                Add products
            </Button>
        </div>
    )
}

export default ProductListActionTools
