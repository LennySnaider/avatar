import { redirect } from 'next/navigation'

// The standalone Video Flows page is consolidated into the Flow Editor tab of
// Avatar Studio (StudioTabs imports VideoFlowCanvas from ./_components). This
// route now redirects to the Studio hub; the _components/_store/_nodes/_engine
// folders remain in place because StudioTabs still imports from them.
export default function VideoFlowsPage() {
    redirect('/concepts/avatar-forge/avatar-studio')
}
