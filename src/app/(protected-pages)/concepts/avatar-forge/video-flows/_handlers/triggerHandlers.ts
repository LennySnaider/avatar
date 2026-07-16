import type { VideoNodeHandler, TriggerBundle } from '../_engine/types'

// Manual trigger: fires whenever the user presses Run. Future trigger types
// (schedule / event) execute server-side and inject their payload here.
export const manualTrigger: VideoNodeHandler = async () => {
    const trigger: TriggerBundle = {
        kind: 'trigger',
        source: 'manual',
        firedAt: new Date().toISOString(),
    }
    return { output: { trigger } }
}
