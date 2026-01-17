'use client'

import DebouceInput from '@/components/shared/DebouceInput'
import useAppendQueryParams from '@/utils/hooks/useAppendQueryParams'
import { TbSearch } from 'react-icons/tb'

const ArticleListSearch = () => {
    const { onAppendQueryParams } = useAppendQueryParams()

    const handleInputChange = (query: string) => {
        onAppendQueryParams({
            query,
        })
    }

    return (
        <DebouceInput
            placeholder="Search..."
            type="text"
            prefix={<TbSearch className="text-lg" />}
            onChange={(e) => handleInputChange(e.target.value)}
        />
    )
}

export default ArticleListSearch
