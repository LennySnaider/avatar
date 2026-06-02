import Container from '@/components/shared/Container'
import ReelRemixMain from './_components/ReelRemixMain'

// Gemini frame analyses (scene + pose + motion) can take a bit on cold starts.
export const maxDuration = 120

export default function Page() {
    return (
        <Container>
            <ReelRemixMain />
        </Container>
    )
}
