'use client'

import { useState } from 'react'
import Container from '@/components/shared/Container'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import ProductForm from '@/components/view/ProductForm'
import sleep from '@/utils/sleep'
import { TbTrash, TbArrowNarrowLeft } from 'react-icons/tb'
import { useRouter } from 'next/navigation'
import type {
    Product,
    ProductFormSchema,
} from '@/components/view/ProductForm/types'

type ProductEditProps = {
    data: Product
}

const ProductEdit = ({ data }: ProductEditProps) => {
    const router = useRouter()

    const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false)

    const [isSubmiting, setIsSubmiting] = useState(false)

    const getDefaultValues = () => {
        if (data) {
            const {
                name,
                description,
                productCode,
                taxRate,
                price,
                bulkDiscountPrice,
                costPerItem,
                imgList,
                category,
                brand,
            } = data

            return {
                name,
                description,
                productCode,
                taxRate,
                price,
                bulkDiscountPrice,
                costPerItem,
                imgList,
                category,
                tags: [{ label: 'trend', value: 'trend' }],
                brand,
            }
        }

        return {}
    }

    const handleFormSubmit = async (values: ProductFormSchema) => {
        console.log('Submitted values', values)
        setIsSubmiting(true)
        await sleep(800)
        setIsSubmiting(false)
        toast.push(<Notification type="success">Changes Saved!</Notification>, {
            placement: 'top-center',
        })
        router.push('/concepts/products/product-list')
    }

    const handleDelete = () => {
        setDeleteConfirmationOpen(true)
    }

    const handleCancel = () => {
        setDeleteConfirmationOpen(false)
    }

    const handleBack = () => {
        router.push('/concepts/products/product-list')
    }

    const handleConfirmDelete = () => {
        setDeleteConfirmationOpen(true)
        toast.push(
            <Notification type="success">Product deleted!</Notification>,
            { placement: 'top-center' },
        )
        router.push('/concepts/products/product-list')
    }

    return (
        <>
            <ProductForm
                defaultValues={getDefaultValues() as ProductFormSchema}
                newProduct={false}
                onFormSubmit={handleFormSubmit}
            >
                <Container>
                    <div className="flex items-center justify-between px-8">
                        <Button
                            className="ltr:mr-3 rtl:ml-3"
                            type="button"
                            variant="plain"
                            icon={<TbArrowNarrowLeft />}
                            onClick={handleBack}
                        >
                            Back
                        </Button>
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
                                Save
                            </Button>
                        </div>
                    </div>
                </Container>
            </ProductForm>
            <ConfirmDialog
                isOpen={deleteConfirmationOpen}
                type="danger"
                title="Remove product"
                onClose={handleCancel}
                onRequestClose={handleCancel}
                onCancel={handleCancel}
                onConfirm={handleConfirmDelete}
            >
                <p>
                    Are you sure you want to remove this product? This action
                    can&apos;t be undo.{' '}
                </p>
            </ConfirmDialog>
        </>
    )
}

export default ProductEdit
