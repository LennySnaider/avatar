'use client'

import { usePathname } from 'next/navigation'

const OrderDetailHeader = () => {
    const pathname = usePathname()

    return <h3>Order: {pathname.split('/').pop()}</h3>
}

export default OrderDetailHeader
