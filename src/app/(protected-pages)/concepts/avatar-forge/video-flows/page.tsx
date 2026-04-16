import { auth } from '@/auth'
import Container from '@/components/shared/Container'
import VideoFlowCanvas from './_components/VideoFlowCanvas'

export default async function VideoFlowsPage() {
    await auth()

    return (
        <Container className="h-[calc(100vh-theme(spacing.16))] p-0">
            <VideoFlowCanvas />
        </Container>
    )
}
