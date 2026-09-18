import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import Container from '@/components/shared/Container'

interface EarningsSkeletonProps {
    variant: 'org' | 'avatar'
}

/** Esqueleto de página para los `loading.tsx` de Inicio y del avatar. */
const EarningsSkeleton = ({ variant }: EarningsSkeletonProps) => {
    return (
        <Container className="py-6">
            <div className="flex items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                    {variant === 'avatar' && (
                        <Skeleton variant="circle" width={56} height={56} />
                    )}
                    <div className="flex flex-col gap-2">
                        <Skeleton width={220} height={24} />
                        <Skeleton width={320} height={14} />
                    </div>
                </div>
                <Skeleton width={120} height={36} />
            </div>
            <div className="flex flex-col xl:flex-row gap-4">
                <div className="flex-1 flex flex-col gap-4">
                    <Card>
                        <div className="flex items-center justify-between">
                            <Skeleton width={120} height={20} />
                            <Skeleton width={150} height={32} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 rounded-2xl p-3 bg-gray-100 dark:bg-gray-700 mt-4">
                            {Array.from({ length: 4 }, (_, i) => (
                                <div
                                    key={i}
                                    className="p-4 flex flex-col gap-3"
                                >
                                    <Skeleton width={90} height={14} />
                                    <Skeleton width={120} height={28} />
                                    <Skeleton width={140} height={14} />
                                </div>
                            ))}
                        </div>
                        <Skeleton className="mt-4" height={360} />
                    </Card>
                    <Card>
                        <Skeleton width={140} height={20} className="mb-4" />
                        {Array.from({ length: 5 }, (_, i) => (
                            <div
                                key={i}
                                className="flex items-center gap-3 py-2"
                            >
                                <Skeleton
                                    variant="circle"
                                    width={36}
                                    height={36}
                                />
                                <Skeleton className="flex-1" height={16} />
                                <Skeleton width={80} height={16} />
                                <Skeleton width={80} height={16} />
                            </div>
                        ))}
                    </Card>
                </div>
                <div className="flex flex-col gap-4 2xl:min-w-[360px]">
                    <Card>
                        <Skeleton width={120} height={20} className="mb-4" />
                        {Array.from({ length: 5 }, (_, i) => (
                            <div key={i} className="flex flex-col gap-2 py-2">
                                <Skeleton height={14} />
                                <Skeleton height={6} />
                            </div>
                        ))}
                    </Card>
                    <Card>
                        <Skeleton width={160} height={20} className="mb-4" />
                        <Skeleton height={14} className="mb-3" />
                        <Skeleton height={14} />
                    </Card>
                </div>
            </div>
        </Container>
    )
}

export default EarningsSkeleton
