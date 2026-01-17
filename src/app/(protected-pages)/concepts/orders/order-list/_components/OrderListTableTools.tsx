'use client'

import DebouceInput from '@/components/shared/DebouceInput'
import OrderListTableFilter from './OrderListTableFilter'
import { TbSearch } from 'react-icons/tb'
import useAppendQueryParams from '@/utils/hooks/useAppendQueryParams'
import type { ChangeEvent } from 'react'

const OrderListTableTools = () => {
    const { onAppendQueryParams } = useAppendQueryParams()

    const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
        onAppendQueryParams({
            query: event.target.value,
        })
    }

    return (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <DebouceInput
                placeholder="Search"
                suffix={<TbSearch className="text-lg" />}
                onChange={handleInputChange}
            />
            <OrderListTableFilter />
        </div>
    )
}

export default OrderListTableTools
