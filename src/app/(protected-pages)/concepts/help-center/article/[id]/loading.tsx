import Loading from '@/components/shared/Loading'
import Container from '@/components/shared/Container'
import MediaSkeleton from '@/components/shared/loaders/MediaSkeleton'
import TextBlockSkeleton from '@/components/shared/loaders/TextBlockSkeleton'

const ArticaleLoading = () => {
    return (
        <Container>
            <div className="lg:flex gap-4">
                <div className="my-6 max-w-[800px] w-full mx-auto">
                    <Loading
                        loading
                        customLoader={
                            <div className="flex flex-col gap-8">
                                <MediaSkeleton />
                                <TextBlockSkeleton rowCount={6} />
                                <TextBlockSkeleton rowCount={4} />
                                <TextBlockSkeleton rowCount={8} />
                            </div>
                        }
                    />
                </div>
            </div>
        </Container>
    )
}

export default ArticaleLoading
