'use client'

import ProductListSearch from './ProductListSearch'
import ProductTableFilter from './ProductTableFilter'
import useAppendQueryParams from '@/utils/hooks/useAppendQueryParams'

const ProducListTableTools = () => {
    const { onAppendQueryParams } = useAppendQueryParams()

    const handleInputChange = (query: string) => {
        onAppendQueryParams({
            query,
        })
    }

    return (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <ProductListSearch onInputChange={handleInputChange} />
            <ProductTableFilter />
        </div>
    )
}

export default ProducListTableTools
