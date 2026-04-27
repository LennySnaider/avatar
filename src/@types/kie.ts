// KIE AI is a unified API aggregator (https://kie.ai). All requests follow
// the same async pattern: createTask → poll recordInfo → parse resultJson.

export type KieTaskState = 'waiting' | 'queuing' | 'generating' | 'success' | 'fail'

// KIE has heterogeneous endpoints — some models go through /jobs/createTask
// (unified async), others through dedicated endpoints like /flux/kontext/generate.
// The model string identifies BOTH the model AND which endpoint family to use.
export type KieImageModel =
    | 'flux-kontext-pro'   // dedicated endpoint /api/v1/flux/kontext/generate
    | 'flux-kontext-max'   // dedicated endpoint /api/v1/flux/kontext/generate

export type KieVideoModel =
    | 'veo-3.1'            // dedicated endpoint /api/v1/veo/generate (TBD wiring)
    | 'veo-3.1-fast'

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

// ─── Flux Kontext (dedicated endpoint) ────────────────────────
// successFlag: 0=generating, 1=success, 2=create-failed, 3=generate-failed
export type KieFluxKontextSuccessFlag = 0 | 1 | 2 | 3

export interface KieFluxKontextRecordInfoResponse {
    code: number
    msg: string
    data: {
        taskId: string
        successFlag: KieFluxKontextSuccessFlag
        // Per KIE docs: resultImageUrl + originImageUrl live INSIDE `response`,
        // not at the top level of `data`.
        response?: {
            resultImageUrl?: string
            originImageUrl?: string
        }
        errorMessage?: string
        errorCode?: string
    }
}
