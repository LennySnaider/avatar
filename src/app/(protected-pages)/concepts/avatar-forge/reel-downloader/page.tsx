import Container from '@/components/shared/Container'
import ReelDownloaderMain from './_components/ReelDownloaderMain'

// Resolving the Reel + streaming the MP4 can take a few seconds on a cold start.
export const maxDuration = 60

export default function Page() {
    return (
        <Container>
            <ReelDownloaderMain />
        </Container>
    )
}
