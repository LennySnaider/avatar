'use client'

import { useState, useEffect } from 'react'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import Checkbox from '@/components/ui/Checkbox'
import { Form, FormItem } from '@/components/ui/Form'
import { useManageArticleStore } from '../_store/manageArticleStore'
import { categoryOption } from '../utils'
import useAppendQueryParams from '@/utils/hooks/useAppendQueryParams'
import { TbFilter } from 'react-icons/tb'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'


type FormSchema = {
    category: Array<string>
}

const validationSchema = z.object({
    category: z.array(z.string()),
})

const ArticleTableFilter = () => {
    const [filterIsOpen, setFilterIsOpen] = useState(false)
    const filterData = useManageArticleStore((state) => state.filterData)

    const { handleSubmit, control, reset } = useForm<FormSchema>({
        defaultValues: filterData,
        resolver: zodResolver(validationSchema),
    })

    useEffect(() => {
        reset(filterData)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterData])

    const { onAppendQueryParams } = useAppendQueryParams()

    const onSubmit = (values: FormSchema) => {
        onAppendQueryParams({
            category: values.category.join(','),
        })
        setFilterIsOpen(false)
    }

    return (
        <>
            <Button icon={<TbFilter />} onClick={() => setFilterIsOpen(true)}>
                Filter
            </Button>
            <Drawer
                title="Filter"
                isOpen={filterIsOpen}
                onClose={() => setFilterIsOpen(false)}
                onRequestClose={() => setFilterIsOpen(false)}
            >
                <Form
                    className="h-full"
                    containerClassName="flex flex-col justify-between h-full"
                    onSubmit={handleSubmit(onSubmit)}
                >
                    <div>
                        <FormItem label="Showing category">
                            <div className="mt-4">
                                <Controller
                                    name="category"
                                    control={control}
                                    render={({ field }) => (
                                        <Checkbox.Group
                                            vertical
                                            className="flex"
                                            {...field}
                                        >
                                            {categoryOption.map((category) => (
                                                <Checkbox
                                                    key={category.value}
                                                    name={field.name}
                                                    value={category.value}
                                                    className="justify-between flex-row-reverse heading-text"
                                                >
                                                    {category.label}
                                                </Checkbox>
                                            ))}
                                        </Checkbox.Group>
                                    )}
                                />
                            </div>
                        </FormItem>
                    </div>
                    <Button variant="solid" type="submit">
                        Query
                    </Button>
                </Form>
            </Drawer>
        </>
    )
}

export default ArticleTableFilter
