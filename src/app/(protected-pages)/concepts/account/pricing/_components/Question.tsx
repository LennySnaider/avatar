'use client'

import { useState } from 'react'
import classNames from '@/utils/classNames'
import { TbMinus, TbPlus } from 'react-icons/tb'

type QuestionProps = {
    title: string
    content: string
    defaultExpand: boolean
    border: boolean
    isFirstChild: boolean
}

const Question = (props: QuestionProps) => {
    const { title, content, defaultExpand, border, isFirstChild } = props

    const [expand, setExpand] = useState(defaultExpand)

    return (
        <div
            className={classNames(
                'flex flex-col w-full',
                border && 'border-b border-gray-200 dark:border-gray-700',
                isFirstChild ? 'pb-6' : 'py-6',
            )}
        >
            <div
                className="flex items-center gap-4 transition-colors h6 font-semibold cursor-pointer group"
                role="button"
                onClick={() => setExpand(!expand)}
            >
                <span className="text-2xl">
                    {expand ? <TbPlus /> : <TbMinus />}
                </span>
                <span className="group-hover:text-primary">{title}</span>
            </div>
            {expand && (
                <div
                    className="mt-4 ltr:ml-10"
                    style={{
                        opacity: 1,
                        transition: 'opacity 0.2s ease-out',
                    }}
                >
                    {content}
                </div>
            )}
        </div>
    )
}

export default Question
