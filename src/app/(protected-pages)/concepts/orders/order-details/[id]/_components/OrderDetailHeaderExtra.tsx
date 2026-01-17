'use client'

import Button from '@/components/ui/Button'
import { usePathname, useRouter } from 'next/navigation'

const OrderDetailHeaderExtra = () => {
    const pathname = usePathname()
    const router = useRouter()

    const handleEditClick = () => {
        const id = pathname.split('/').pop()
        router.push(`/concepts/orders/order-edit/${id}`)
    }

    return (
        <div className="flex items-center gap-2 print:hidden">
            <Button onClick={() => window.print()}>Print</Button>
            <Button variant="solid" onClick={handleEditClick}>
                Edit
            </Button>
        </div>
    )
}

export default OrderDetailHeaderExtra
