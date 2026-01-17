'use client'

import { useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import ScrollBar from '@/components/ui/ScrollBar'
import Loading from '@/components/shared/Loading'
import Table from '@/components/ui/Table'
import Checkbox from '@/components/ui/Checkbox'
import Badge from '@/components/ui/Badge'
import MailDeleteConfimation from './MailDeleteConfimation'
import classNames from '@/utils/classNames'
import { useMailStore } from '../_store/mailStore'
import useMailAction from '../_hooks/useMailAction'
import { labelList } from '../constants'
import isLastChild from '@/utils/isLastChild'
import { useRouter, useSearchParams } from 'next/navigation'
import { TbStarFilled, TbTrash, TbStar, TbFlag } from 'react-icons/tb'
import type { MouseEvent } from 'react'
import { Mail } from '../types'

const htmlReg = /(<([^>]+)>)/gi

const { THead, Th, TBody, Tr, Td } = Table

const MailList = () => {
    const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState<{
        open: boolean
        selected: string
    }>({
        open: false,
        selected: '',
    })

    const selectedMailId = useMailStore((state) => state.selectedMailId)
    const setMail = useMailStore((state) => state.setMail)
    const mailList = useMailStore((state) => state.mailList)
    const mailListFetched = useMailStore((state) => state.mailListFetched)
    const setSelectedMail = useMailStore((state) => state.setSelectedMail)

    const {
        onFlagToggle,
        onCheckboxToggle,
        onStarToggle,
        onResetChecked,
        onMailDelete,
    } = useMailAction()

    const router = useRouter()

    const searchParams = useSearchParams()

    const renderSubject = (title: string, content: string) => {
        const text = content.replace(htmlReg, '')
        const titleOffsetNumber = title.length

        return (
            <div className="flex items-center gap-3">
                <span className="font-semibold heading-text text-nowrap">
                    {title}
                </span>
                <span className="text-nowrap">
                    {text.length > 45 - titleOffsetNumber
                        ? text.substring(0, 42 - titleOffsetNumber) + '...'
                        : text}
                </span>
            </div>
        )
    }

    const handleMailClick = (e: MouseEvent<HTMLElement>, mail: Mail) => {
        e.stopPropagation()
        setMail(mail)
        onResetChecked()

        const param: Record<string, string> = {
            mail: mail.id,
        }

        const params = ['label', 'category']

        params.forEach((key) => {
            if (searchParams.get(key)) {
                param[key] = searchParams.get(key) as string
            }
        })

        router.push(`/concepts/mail?${new URLSearchParams(param).toString()}`)
    }

    const handleCheckboxClick = (e: MouseEvent<HTMLDivElement>, mail: Mail) => {
        e.stopPropagation()
        onCheckboxToggle(mail)
        if (!mail.checked) {
            if (!selectedMailId.includes(mail.id)) {
                setSelectedMail([...selectedMailId, mail.id])
            }
        } else {
            setSelectedMail(selectedMailId.filter((id) => mail.id !== id))
        }
    }

    const handleAction = (
        e: MouseEvent<HTMLButtonElement>,
        callback: (mail: Mail, setMail: boolean) => void,
        mail: Mail,
    ) => {
        e.stopPropagation()
        callback(mail, false)
    }

    const handleClose = () => {
        setDeleteConfirmationOpen({
            open: false,
            selected: '',
        })
    }

    const handleConfirmDelete = () => {
        onMailDelete([deleteConfirmationOpen.selected])
        handleClose()
    }

    return (
        <>
            <div className="lg:absolute top-0 left-0 h-full w-full">
                <ScrollBar
                    autoHide
                    className="overflow-y-auto lg:h-full lg:max-w-full"
                >
                    <Loading
                        type={mailList.length > 0 ? 'cover' : 'default'}
                        spinnerClass={mailList.length > 0 ? 'hidden' : ''}
                        loading={!mailListFetched}
                    >
                        <Table
                            compact
                            overflow={false}
                            className="hidden lg:table"
                        >
                            <THead>
                                <Tr>
                                    <Th colSpan={2}>From</Th>
                                    <Th></Th>
                                    <Th>Subject</Th>
                                    <Th>Received</Th>
                                    <Th></Th>
                                </Tr>
                            </THead>
                            <TBody>
                                {mailList.map((mail) => (
                                    <Tr
                                        key={mail.id}
                                        className="group"
                                        onClick={(e) =>
                                            handleMailClick(e, mail)
                                        }
                                    >
                                        <Td width="40">
                                            <div className="h-[32px] w-[32px] flex items-center justify-center">
                                                <Avatar
                                                    shape="circle"
                                                    src={mail.avatar}
                                                    size="sm"
                                                    className={classNames(
                                                        'group-hover:hidden',
                                                        mail.checked &&
                                                            'hidden',
                                                    )}
                                                />
                                                <div
                                                    className={classNames(
                                                        'group-hover:block',
                                                        mail.checked
                                                            ? 'block'
                                                            : 'hidden',
                                                    )}
                                                >
                                                    <div
                                                        className="flex items-center"
                                                        onClick={(e) =>
                                                            handleCheckboxClick(
                                                                e,
                                                                mail,
                                                            )
                                                        }
                                                    >
                                                        <Checkbox
                                                            checked={
                                                                mail.checked
                                                            }
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </Td>
                                        <Td>
                                            <span className="font-bold heading-text truncate">
                                                {mail.name}
                                            </span>
                                        </Td>
                                        <Td>
                                            <div className="flex justify-end">
                                                {labelList.some(
                                                    (label) =>
                                                        label.value ===
                                                        mail.label,
                                                ) && (
                                                    <Badge
                                                        className={
                                                            labelList.find(
                                                                (label) =>
                                                                    label.value ===
                                                                    mail.label,
                                                            )?.dotClass
                                                        }
                                                    />
                                                )}
                                            </div>
                                        </Td>
                                        <Td className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                                            {renderSubject(
                                                mail.title,
                                                mail.message[0].content,
                                            )}
                                        </Td>
                                        <Td>{mail.message[0].date}</Td>
                                        <Td>
                                            <div className="flex items-center text-lg gap-2">
                                                <button
                                                    type="button"
                                                    title="Flag"
                                                    onClick={(e) =>
                                                        handleAction(
                                                            e,
                                                            onFlagToggle,
                                                            mail,
                                                        )
                                                    }
                                                >
                                                    <TbFlag
                                                        className={classNames(
                                                            mail.flagged &&
                                                                'text-red-500',
                                                        )}
                                                    />
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Star"
                                                    onClick={(e) =>
                                                        handleAction(
                                                            e,
                                                            onStarToggle,
                                                            mail,
                                                        )
                                                    }
                                                >
                                                    {mail.starred ? (
                                                        <TbStarFilled className="text-amber-500" />
                                                    ) : (
                                                        <TbStar />
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Delete"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setDeleteConfirmationOpen(
                                                            {
                                                                open: true,
                                                                selected:
                                                                    mail.id,
                                                            },
                                                        )
                                                    }}
                                                >
                                                    <TbTrash />
                                                </button>
                                            </div>
                                        </Td>
                                    </Tr>
                                ))}
                            </TBody>
                        </Table>
                        <div className="lg:hidden">
                            {mailList.map((mail, index) => (
                                <div
                                    key={mail.id}
                                    className={classNames(
                                        'flex justify-between items-center gap-2 px-2 rounded-xl border-gray-200 dark:border-gray-700 py-4 cursor-pointer group',
                                        !isLastChild(mailList, index) &&
                                            'border-b',
                                    )}
                                    onClick={(e) => handleMailClick(e, mail)}
                                >
                                    <div className="flex gap-4 min-w-0">
                                        <div className="h-[32px] w-[32px] flex items-center justify-center">
                                            <Avatar
                                                shape="circle"
                                                src={mail.avatar}
                                                size="sm"
                                                className={classNames(
                                                    'group-hover:hidden',
                                                    mail.checked && 'hidden',
                                                )}
                                            />
                                            <div
                                                className={classNames(
                                                    'group-hover:block',
                                                    mail.checked
                                                        ? 'block'
                                                        : 'hidden',
                                                )}
                                            >
                                                <div
                                                    className="flex items-center"
                                                    onClick={(e) =>
                                                        handleCheckboxClick(
                                                            e,
                                                            mail,
                                                        )
                                                    }
                                                >
                                                    <Checkbox
                                                        checked={mail.checked}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="font-bold heading-text truncate">
                                                {mail.name}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-nowrap truncate">
                                                    {mail.message[0].content.replace(
                                                        htmlReg,
                                                        '',
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center text-lg gap-2 mt-2">
                                                <button
                                                    type="button"
                                                    title="Flag"
                                                    onClick={(e) =>
                                                        handleAction(
                                                            e,
                                                            onFlagToggle,
                                                            mail,
                                                        )
                                                    }
                                                >
                                                    <TbFlag
                                                        className={classNames(
                                                            mail.flagged &&
                                                                'text-red-500',
                                                        )}
                                                    />
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Star"
                                                    onClick={(e) =>
                                                        handleAction(
                                                            e,
                                                            onStarToggle,
                                                            mail,
                                                        )
                                                    }
                                                >
                                                    {mail.starred ? (
                                                        <TbStarFilled className="text-amber-500" />
                                                    ) : (
                                                        <TbStar />
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Delete"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setDeleteConfirmationOpen(
                                                            {
                                                                open: true,
                                                                selected:
                                                                    mail.id,
                                                            },
                                                        )
                                                    }}
                                                >
                                                    <TbTrash />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="">
                                        <span className="text-nowrap font-semibold">
                                            {mail.message[0].date}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Loading>
                </ScrollBar>
            </div>
            <MailDeleteConfimation
                isOpen={deleteConfirmationOpen.open}
                selectedMailCount={1}
                onClose={handleClose}
                onConfirmDelete={handleConfirmDelete}
            />
        </>
    )
}

export default MailList
