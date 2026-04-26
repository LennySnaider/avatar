// KIE AI is a unified API aggregator (https://kie.ai). All requests follow
// the same async pattern: createTask → poll recordInfo → parse resultJson.

export type KieTaskState = 'waiting' | 'queuing' | 'generating' | 'success' | 'fail'

// Model strings follow the pattern <provider>-<version>/<task>.
// These are best-effort defaults; verify against the live KIE catalog and
// adjust if the platform renames them.
export type KieImageModel =
    | 'flux-kontext/text-to-image'
    | 'gpt-image-2/text-to-image'
    | 'gpt-image-2/image-to-image'

export type KieVideoModel =
    | 'veo-3.1/text-to-video'
    | 'veo-3.1-fast/text-to-video'
    | 'veo-3.1/image-to-video'

export interface KieCreateTaskRequest {
    model: string
    /** Optional webhook URL — if set, KIE pings here on completion. */
    callBackUrl?: string
    /** Model-specific input fields (prompt, image_url, aspect_ratio, etc.). */
    input: Record<string, unknown>
}

export interface KieCreateTaskResponse {
    code: number
    msg: string
    data: {
        taskId: string
    }
}

export interface KieRecordInfoResponse {
    code: number
    msg: string
    data: {
        taskId: string
        model: string
        state: KieTaskState
        param: string
        /** JSON-encoded string. For media tasks: `{ "resultUrls": ["https://..."] }`. */
        resultJson: string
        failCode: string
        failMsg: string
        costTime: number
        completeTime: number
        createTime: number
        updateTime: number
        progress: number
    }
}

export interface KieResultJsonShape {
    resultUrls?: string[]
    [key: string]: unknown
}
