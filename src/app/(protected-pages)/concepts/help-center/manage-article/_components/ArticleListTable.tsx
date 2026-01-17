'use client'

import { useMemo } from 'react'
import Avatar from '@/components/ui/Avatar'
import Tag from '@/components/ui/Tag'
import Switcher from '@/components/ui/Switcher'
import UsersAvatarGroup from '@/components/shared/UsersAvatarGroup'
import DataTable from '@/components/shared/DataTable'
import { useManageArticleStore } from '../_store/manageArticleStore'
import { categoryIcon, categoryClass } from '../utils'
import classNames from '@/utils/classNames'
import useAppendQueryParams from '@/utils/hooks/useAppendQueryParams'
import Link from 'next/link'
import type { Article } from '../types'
import type { OnSortParam, ColumnDef, Row } from '@/components/shared/DataTable'

type ArticleListTableProps = {
    pageIndex?: number
    pageSize?: number
}

const ArticleListTable = ({
    pageIndex = 1,
    pageSize = 10,
}: ArticleListTableProps) => {
    const articleList = useManageArticleStore((state) => state.articleList)

    const articleTotal = useManageArticleStore((state) => state.articleTotal)

    const loading = useManageArticleStore((state) => state.loading)

    const selectedArticle = useManageArticleStore(
        (state) => state.selectedArticle,
    )
    const setSelectedArticle = useManageArticleStore(
        (state) => state.setSelectedArticle,
    )
    const setSelectAllArticle = useManageArticleStore(
        (state) => state.setSelectAllArticle,
    )

    const { onAppendQueryParams } = useAppendQueryParams()

    const columns: ColumnDef<Article>[] = useMemo(
        () => [
            {
                header: 'Title',
                accessorKey: 'title',
                cell: (props) => {
                    const row = props.row.original
                    return (
                        <div className="flex items-center gap-4">
                            <Avatar
                                icon={categoryIcon[row.category]}
                                shape="round"
                                className={classNames(
                                    'text-gray-900',
                                    categoryClass[row.category],
                                )}
                            />
                            <div>
                                <div className="mb-2">
                                    <Link
                                        href={`/concepts/help-center/edit-article/${row.id}`}
                                        className="font-bold heading-text hover:text-primary"
                                    >
                                        {row.title}
                                    </Link>
                                </div>
                                <div className="flex items-center gap-1">
                                    {row.tags.map((tag) => (
                                        <Tag key={tag.id}>{tag.label}</Tag>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )
                },
            },
            {
                header: 'Authors',
                accessorKey: 'authors',
                enableSorting: false,
                cell: (props) => {
                    const row = props.row.original
                    return (
                        <UsersAvatarGroup
                            avatarProps={{ size: 25 }}
                            users={row.authors || []}
                        />
                    )
                },
            },
            {
                header: 'Last update',
                accessorKey: 'updateTimeStamp',
                cell: (props) => {
                    const row = props.row.original
                    return <div>{row.updateTime}</div>
                },
            },
            {
                header: 'Published',
                accessorKey: 'published',
                enableSorting: false,
                cell: (props) => {
                    const row = props.row.original
                    return (
                        <div className="px-4">
                            <Switcher defaultChecked={row.published} />
                        </div>
                    )
                },
            },
        ],
        [],
    )

    const handlePaginationChange = (page: number) => {
        onAppendQueryParams({
            pageIndex: String(page),
        })
    }

    const handleSelectChange = (value: number) => {
        onAppendQueryParams({
            pageSize: String(value),
            pageIndex: '1',
        })
    }

    const handleSort = (sort: OnSortParam) => {
        onAppendQueryParams({
            order: sort.order,
            sortKey: sort.key,
        })
    }

    const handleRowSelect = (checked: boolean, row: Article) => {
        setSelectedArticle(checked, row)
    }

    const handleAllRowSelect = (checked: boolean, rows: Row<Article>[]) => {
        if (checked) {
            const originalRows = rows.map((row) => row.original)
            setSelectAllArticle(originalRows)
        } else {
            setSelectAllArticle([])
        }
    }

    return (
        <div>
            <DataTable
                selectable
                hoverable={false}
                columns={columns}
                data={articleList}
                noData={articleList.length === 0}
                skeletonAvatarColumns={[0]}
                skeletonAvatarProps={{ width: 28, height: 28 }}
                loading={loading}
                pagingData={{
                    total: articleTotal || 0,
                    pageIndex,
                    pageSize,
                }}
                checkboxChecked={(row) =>
                    selectedArticle.some((selected) => selected.id === row.id)
                }
                onPaginationChange={handlePaginationChange}
                onSelectChange={handleSelectChange}
                onSort={handleSort}
                onCheckBoxChange={handleRowSelect}
                onIndeterminateCheckBoxChange={handleAllRowSelect}
            />
        </div>
    )
}

export default ArticleListTable
