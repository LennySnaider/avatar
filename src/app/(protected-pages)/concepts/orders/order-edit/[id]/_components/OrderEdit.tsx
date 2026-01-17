'use client'

import { useState, useMemo } from 'react'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Container from '@/components/shared/Container'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import OrderForm from '@/components/view/OrderForm'
import sleep from '@/utils/sleep'
import { useRouter } from 'next/navigation'
import { TbTrash } from 'react-icons/tb'
import type { OrderFormSchema } from '@/components/view/OrderForm'

export type OrderDetails = {
    id: string
    progressStatus: number
    paymentStatus: number
    dateTime: number
    paymentSummary: {
        subTotal: number
        tax: number
        deliveryFees: number
        total: number
        customerPayment: number
    }
    note: string
    shipping: {
        deliveryFees: number
        estimatedMin: number
        estimatedMax: number
        shippingLogo: string
        shippingVendor: string
    }
    product: {
        id: string
        name: string
        productCode: string
        img: string
        price: number
        quantity: number
        total: number
        details: Record<string, string[]>
    }[]
    activity: {
        date: number
        events: {
            time: number
            action: string
            recipient?: string
        }[]
    }[]
    customer: {
        name: string
        firstName: string
        lastName: string
        email: string
        phone: string
        dialCode: string
        phoneNumber: string
        img: string
        previousOrder: number
        country: string
        address: string
        postcode: string
        city: string
    }
}

type OrderDetailProps = {
    data: OrderDetails
}

const OrderEdit = ({ data }: OrderDetailProps) => {
    const router = useRouter()

    const [discardConfirmationOpen, setDiscardConfirmationOpen] =
        useState(false)
    const [isSubmiting, setIsSubmiting] = useState(false)

    const handleFormSubmit = async (values: OrderFormSchema) => {
        console.log('Submitted values', values)
        setIsSubmiting(true)
        await sleep(800)
        setIsSubmiting(false)
        toast.push(
            <Notification type="success">
                Order: #{data?.id} updated!
            </Notification>,
            { placement: 'top-center' },
        )
        router.push('/concepts/orders/order-list')
    }

    const handleConfirmDiscard = () => {
        setDiscardConfirmationOpen(true)
        toast.push(<Notification type="success">Order deleted!</Notification>, {
            placement: 'top-center',
        })
        router.push('/concepts/orders/order-list')
    }

    const handleDelete = () => {
        setDiscardConfirmationOpen(true)
    }

    const handleCancel = () => {
        setDiscardConfirmationOpen(false)
    }

    const orderFormProps = useMemo(() => {
        const products = data
            ? data.product.map(
                  ({ id, name, productCode, img, price, quantity }) => {
                      return {
                          id,
                          name,
                          productCode,
                          img,
                          price,
                          quantity,
                          stock: 0,
                      }
                  },
              )
            : []

        const defaultValues = {
            firstName: data?.customer.name || '',
            lastName: data?.customer.lastName || '',
            email: data?.customer.email || '',
            dialCode: data?.customer.dialCode || '',
            phoneNumber: data?.customer.phoneNumber || '',
            country: data?.customer.country || '',
            address: data?.customer.address || '',
            postcode: data?.customer.postcode || '',
            city: data?.customer.city || '',
            paymentMethod: 'paypal',
            paypalEmail: data?.customer.email,
        } as OrderFormSchema

        return {
            defaultProducts: products,
            defaultValues,
        }
    }, [data])

    return (
        <>
            <OrderForm onFormSubmit={handleFormSubmit} {...orderFormProps}>
                <Container>
                    <div className="flex items-center justify-between px-8">
                        <span></span>
                        <div className="flex items-center">
                            <Button
                                className="ltr:mr-3 rtl:ml-3"
                                type="button"
                                customColorClass={() =>
                                    'border-error ring-1 ring-error text-error hover:border-error hover:ring-error hover:text-error bg-transparent'
                                }
                                icon={<TbTrash />}
                                onClick={handleDelete}
                            >
                                Delete
                            </Button>
                            <Button
                                variant="solid"
                                type="submit"
                                loading={isSubmiting}
                            >
                                Update
                            </Button>
                        </div>
                    </div>
                </Container>
            </OrderForm>
            <ConfirmDialog
                isOpen={discardConfirmationOpen}
                type="danger"
                title="Discard changes"
                onClose={handleCancel}
                onRequestClose={handleCancel}
                onCancel={handleCancel}
                onConfirm={handleConfirmDiscard}
            >
                <p>
                    Are you sure you want delete this? This action can&apos;t be
                    undo.{' '}
                </p>
            </ConfirmDialog>
        </>
    )
}

export default OrderEdit
