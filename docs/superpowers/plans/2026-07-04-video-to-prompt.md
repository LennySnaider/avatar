# Video-to-Prompt ("From Video") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "From video" button next to the main prompt textarea that analyzes a reference video with Gemini and produces a detailed cinematic prompt (action beats, camera, scene — never the person's appearance) the user can edit and apply.

**Architecture:** New server action `analyzeVideoForPrompt` in GeminiService fetches the video server-side and sends it inline to `gemini-2.5-flash` with structured JSON output. A new `VideoToPromptDialog` handles source selection (signed-URL upload to Supabase or direct URL), analysis, and writing the result to the Zustand store. BottomControlBar gets the trigger button.

**Tech Stack:** Next.js 15 server actions, `@google/genai` (already in GeminiService), Supabase Storage signed uploads (existing `createMotionVideoUploadUrl`), Zustand store, ECME UI (Dialog/Button/Input).

**Spec:** `docs/superpowers/specs/2026-07-04-video-to-prompt-design.md`

## Global Constraints

- No test framework exists in this repo — the automated gate for every task is `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "\.next/"` returning **empty**; UI behavior verifies manually in dev (`npm run dev`, port 3030).
- Error-as-data across the server-action boundary (never throw to the client) — same pattern as `generateMotionControlKieSafe` in `src/services/KieService.ts:947`.
- The generated prompt must NEVER describe the reference person's face, body, hair, clothing, or identity.
- 20MB max video for analysis (Gemini inline limit). Upload UI cap stays 50MB (storage), but analysis rejects >20MB with a friendly message.
- No 🤖/Claude/Anthropic lines in commit messages.

---

### Task 1: `analyzeVideoForPrompt` server action

**Files:**
- Modify: `src/services/GeminiService.ts` (append after `generateContinuationPrompt`, which ends near line 320)

**Interfaces:**
- Consumes: existing `getApiKey()` (line 38), `GoogleGenAI` + `Type` imports (line 3).
- Produces (Task 2 depends on these exact names):
  ```ts
  export interface AnalyzeVideoResult {
      success: boolean
      prompt?: string
      suggestedDurationSeconds?: number
      error?: string
  }
  export async function analyzeVideoForPrompt(videoUrl: string): Promise<AnalyzeVideoResult>
  ```

- [ ] **Step 1: Append the implementation to `src/services/GeminiService.ts`**

```ts
// =============================================
// VIDEO → PROMPT (imitate a reference video)
// =============================================

const MAX_ANALYZE_VIDEO_BYTES = 20 * 1024 * 1024 // Gemini inline-data limit

export interface AnalyzeVideoResult {
    success: boolean
    prompt?: string
    suggestedDurationSeconds?: number
    error?: string
}

/**
 * Analyze a reference video and produce a detailed cinematic i2v prompt that
 * imitates it: action beats, camera work, pacing, scene, lighting, mood.
 * NEVER describes the person's appearance — the avatar's [BODY]/[FACE]
 * harness owns identity. Error-as-data: a throw from a 'use server' action
 * reaches the client as a masked 500.
 */
export async function analyzeVideoForPrompt(
    videoUrl: string,
): Promise<AnalyzeVideoResult> {
    try {
        const res = await fetch(videoUrl)
        if (!res.ok) {
            return { success: false, error: `Could not fetch video from URL (HTTP ${res.status})` }
        }
        const buffer = Buffer.from(await res.arrayBuffer())
        if (buffer.byteLength > MAX_ANALYZE_VIDEO_BYTES) {
            return {
                success: false,
                error: `Video too large to analyze (${Math.round(buffer.byteLength / 1024 / 1024)}MB, max 20MB) — trim or compress it`,
            }
        }
        const mimeType = res.headers.get('content-type')?.split(';')[0] || 'video/mp4'
        if (!mimeType.startsWith('video/')) {
            return { success: false, error: `URL did not return a video (got ${mimeType})` }
        }

        const apiKey = getApiKey()
        const ai = new GoogleGenAI({ apiKey })

        const instructions = `
You are a film director analyzing a reference video to recreate its ENERGY with a DIFFERENT actor.

Watch the video and write ONE cinematic image-to-video prompt (English, 100-200 words) that reproduces:
1. ACTION, beat by beat with timing: what the subject does first, next, last (gestures, head/body movement, expression changes as actions — e.g. "breaks into a smile", not descriptions of the face itself).
2. CAMERA: framing (close-up/medium/wide), movement (locked-off, handheld sway, push-in, orbit, pan, tilt), lens feel (shallow depth of field, wide angle distortion).
3. PACING & MOOD: slow/fast, smooth/energetic, the overall vibe.
4. SCENE: environment, background elements, lighting (source, warmth, time of day), color grade.

ABSOLUTE PROHIBITIONS — the prompt must contain ZERO physical description of the person in the video:
- No face, skin, hair color/style, body shape, age, ethnicity.
- No clothing or accessories.
- Refer to the performer only as "the subject".
Ignore any text overlays, captions, stickers or watermarks in the video.

Also report the video's approximate duration in seconds.
`

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { mimeType, data: buffer.toString('base64') } },
                    { text: instructions },
                ],
            },
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        prompt: { type: Type.STRING },
                        durationSeconds: { type: Type.NUMBER },
                    },
                    required: ['prompt'],
                },
            },
        })

        const raw = response.text
        if (!raw) return { success: false, error: 'Gemini returned an empty analysis' }
        const parsed = JSON.parse(raw) as { prompt: string; durationSeconds?: number }
        if (!parsed.prompt?.trim()) {
            return { success: false, error: 'Gemini returned an empty prompt' }
        }
        return {
            success: true,
            prompt: parsed.prompt.trim(),
            suggestedDurationSeconds: parsed.durationSeconds,
        }
    } catch (e) {
        console.error('[GeminiService] analyzeVideoForPrompt failed', e)
        return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "\.next/"`
Expected: empty output.

If `config` is rejected by the installed `@google/genai` version, check an existing structured-output call in this same file (search `responseSchema`) and mirror its exact option shape.

- [ ] **Step 3: Commit**

```bash
git add src/services/GeminiService.ts
git commit -m "feat(avatar-studio): analyzeVideoForPrompt server action (video -> cinematic prompt)"
```

---

### Task 2: `VideoToPromptDialog` component

**Files:**
- Create: `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/VideoToPromptDialog.tsx`

**Interfaces:**
- Consumes: `analyzeVideoForPrompt`, `AnalyzeVideoResult` (Task 1); `createMotionVideoUploadUrl` from `@/services/KieService`; `supabase` from `@/lib/supabase`; `useAvatarStudioStore` (`setPrompt`).
- Produces (Task 3 depends on this exact signature):
  ```ts
  interface VideoToPromptDialogProps { isOpen: boolean; onClose: () => void }
  export default VideoToPromptDialog
  ```

- [ ] **Step 1: Create the component file**

```tsx
'use client'

import { useRef, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import { supabase } from '@/lib/supabase'
import { createMotionVideoUploadUrl } from '@/services/KieService'
import { analyzeVideoForPrompt } from '@/services/GeminiService'
import {
    HiOutlineFilm,
    HiOutlineUpload,
    HiOutlineLink,
    HiOutlineSparkles,
    HiOutlineX,
} from 'react-icons/hi'

interface VideoToPromptDialogProps {
    isOpen: boolean
    onClose: () => void
}

type SourceTab = 'upload' | 'url'

const VideoToPromptDialog = ({ isOpen, onClose }: VideoToPromptDialogProps) => {
    const setPrompt = useAvatarStudioStore((s) => s.setPrompt)

    const fileInputRef = useRef<HTMLInputElement>(null)
    const [activeTab, setActiveTab] = useState<SourceTab>('upload')
    const [urlInput, setUrlInput] = useState('')
    const [videoUrl, setVideoUrl] = useState<string | null>(null)
    const [videoDuration, setVideoDuration] = useState<number | null>(null)
    const [isUploading, setIsUploading] = useState(false)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [resultPrompt, setResultPrompt] = useState('')
    const [suggestedDuration, setSuggestedDuration] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)

    const reset = () => {
        setUrlInput('')
        setVideoUrl(null)
        setVideoDuration(null)
        setIsUploading(false)
        setIsAnalyzing(false)
        setResultPrompt('')
        setSuggestedDuration(null)
        setError(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleClose = () => {
        reset()
        onClose()
    }

    // Straight-to-Supabase upload via signed URL (dodges Vercel's 4.5MB cap)
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('video/')) {
            setError('Please select a video file')
            return
        }
        if (file.size > 50 * 1024 * 1024) {
            setError('Video file must be less than 50MB')
            return
        }
        setError(null)
        setIsUploading(true)
        try {
            const ticket = await createMotionVideoUploadUrl(file.type)
            const { error: upErr } = await supabase.storage
                .from('generations')
                .uploadToSignedUrl(ticket.path, ticket.token, file, {
                    contentType: file.type,
                })
            if (upErr) throw new Error(upErr.message)
            setVideoUrl(ticket.publicUrl)
        } catch (err) {
            setError(`Upload failed: ${err instanceof Error ? err.message : String(err)}`)
        } finally {
            setIsUploading(false)
        }
    }

    const handleUrlSubmit = () => {
        if (!urlInput.trim()) return
        setError(null)
        setVideoUrl(urlInput.trim())
    }

    const handleAnalyze = async () => {
        if (!videoUrl) return
        setIsAnalyzing(true)
        setError(null)
        try {
            const result = await analyzeVideoForPrompt(videoUrl)
            if (!result.success || !result.prompt) {
                setError(result.error || 'Analysis failed')
                return
            }
            setResultPrompt(result.prompt)
            setSuggestedDuration(result.suggestedDurationSeconds ?? videoDuration)
        } finally {
            setIsAnalyzing(false)
        }
    }

    const handleUsePrompt = () => {
        setPrompt(resultPrompt.trim())
        handleClose()
    }

    return (
        <Dialog isOpen={isOpen} onClose={handleClose} width={640} closable>
            <div className="flex flex-col">
                {/* Header */}
                <div className="flex items-center gap-3 p-5 border-b border-gray-200 dark:border-gray-700">
                    <div className="p-2 bg-purple-100 dark:bg-purple-500/20 rounded-lg">
                        <HiOutlineFilm className="w-5 h-5 text-purple-600 dark:text-purple-300" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            Prompt from Video
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Analyze a reference video and build a detailed prompt that imitates it
                        </p>
                    </div>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {/* Source tabs */}
                    <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-900/50 rounded-lg">
                        <button
                            onClick={() => setActiveTab('upload')}
                            className={`flex-1 py-2 px-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                                activeTab === 'upload'
                                    ? 'bg-purple-600 text-white'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            <HiOutlineUpload className="w-3 h-3" />
                            Upload
                        </button>
                        <button
                            onClick={() => setActiveTab('url')}
                            className={`flex-1 py-2 px-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                                activeTab === 'url'
                                    ? 'bg-purple-600 text-white'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            <HiOutlineLink className="w-3 h-3" />
                            URL
                        </button>
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/*"
                        onChange={handleFileUpload}
                        className="hidden"
                    />

                    {/* Source: upload */}
                    {activeTab === 'upload' && !videoUrl && (
                        <div
                            onClick={() => !isUploading && fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                                isUploading
                                    ? 'border-purple-500'
                                    : 'border-gray-300 dark:border-gray-600 cursor-pointer hover:border-purple-500'
                            }`}
                        >
                            <HiOutlineUpload
                                className={`w-8 h-8 mx-auto mb-2 ${isUploading ? 'text-purple-400 animate-pulse' : 'text-gray-400'}`}
                            />
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {isUploading ? 'Uploading video…' : 'Click to upload a reference video'}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                Any framing works — selfies, close-ups, b-roll. Max 20MB for analysis.
                            </p>
                        </div>
                    )}

                    {/* Source: URL */}
                    {activeTab === 'url' && !videoUrl && (
                        <div className="flex gap-2">
                            <Input
                                type="url"
                                placeholder="https://example.com/video.mp4"
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                className="flex-1"
                                size="sm"
                            />
                            <Button size="sm" variant="solid" onClick={handleUrlSubmit} disabled={!urlInput.trim()}>
                                Set
                            </Button>
                        </div>
                    )}

                    {/* Preview + analyze */}
                    {videoUrl && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-xs text-gray-500 dark:text-gray-400">
                                    Reference video{videoDuration ? ` · ~${Math.round(videoDuration)}s` : ''}
                                </label>
                                <Button size="xs" variant="plain" onClick={reset} icon={<HiOutlineX />}>
                                    Remove
                                </Button>
                            </div>
                            <div className="rounded-lg overflow-hidden bg-black">
                                <video
                                    src={videoUrl}
                                    className="w-full max-h-52 object-contain"
                                    controls
                                    onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration)}
                                />
                            </div>
                            <Button
                                block
                                variant="solid"
                                onClick={handleAnalyze}
                                loading={isAnalyzing}
                                icon={<HiOutlineSparkles />}
                            >
                                {isAnalyzing ? 'Analyzing video…' : 'Analyze video'}
                            </Button>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                        </div>
                    )}

                    {/* Result */}
                    {resultPrompt && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs text-gray-500 dark:text-gray-400">
                                    Generated prompt (editable)
                                </label>
                                {suggestedDuration && (
                                    <span className="text-xs text-purple-500 dark:text-purple-300">
                                        Reference ≈ {Math.round(suggestedDuration)}s — pick the closest duration
                                    </span>
                                )}
                            </div>
                            <textarea
                                value={resultPrompt}
                                onChange={(e) => setResultPrompt(e.target.value)}
                                rows={8}
                                className="w-full text-sm p-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <Button variant="plain" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="solid"
                        color="purple"
                        onClick={handleUsePrompt}
                        disabled={!resultPrompt.trim()}
                    >
                        Use prompt
                    </Button>
                </div>
            </div>
        </Dialog>
    )
}

export default VideoToPromptDialog
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "\.next/"`
Expected: empty. If `Input`'s `size="sm"` errors, drop the prop (ECME Input sizes vary); if `Button` lacks `loading`, replace with `disabled={isAnalyzing}`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/VideoToPromptDialog.tsx"
git commit -m "feat(avatar-studio): VideoToPromptDialog (reference video -> editable prompt)"
```

---

### Task 3: Trigger button in BottomControlBar + E2E verification

**Files:**
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/BottomControlBar.tsx`
  - Import block (top of file), component state, the `rightContent` button grid at lines ~631-686, and dialog render next to other dialogs at the end of the JSX.

**Interfaces:**
- Consumes: `VideoToPromptDialog` default export (Task 2).

- [ ] **Step 1: Add import and state**

Add to imports:
```tsx
import VideoToPromptDialog from './VideoToPromptDialog'
```
Icon: `HiOutlineFilm` — add to the existing `react-icons/hi` import if absent.

Inside the component, next to the other `useState` calls:
```tsx
const [isVideoToPromptOpen, setIsVideoToPromptOpen] = useState(false)
```

- [ ] **Step 2: Add the button to the `rightContent` grid**

Inside `<div className="grid grid-cols-2 gap-1">` (line ~632), after the "Enhance prompt with AI" Tooltip block:
```tsx
<Tooltip title="Prompt from video">
    <button
        onClick={() => setIsVideoToPromptOpen(true)}
        className="p-1.5 text-gray-400 hover:text-purple-500 transition-colors border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
    >
        <HiOutlineFilm className="w-4 h-4" />
    </button>
</Tooltip>
```

- [ ] **Step 3: Render the dialog**

Immediately before the component's closing fragment/root element (where other overlays render):
```tsx
<VideoToPromptDialog
    isOpen={isVideoToPromptOpen}
    onClose={() => setIsVideoToPromptOpen(false)}
/>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "\.next/"`
Expected: empty.

- [ ] **Step 5: Manual E2E verification**

1. `npm run dev` → http://localhost:3030 → Avatar Studio.
2. Click the film button next to the prompt textarea → dialog opens.
3. Upload one of the reels that motion-control rejected (selfie close-up) → preview shows, duration appears.
4. "Analyze video" → prompt appears in the editable textarea. **Check it contains NO physical description of the person** (no hair/face/clothing words) and DOES contain camera + action + scene language.
5. Edit a word, click "Use prompt" → main textarea now holds the prompt.
6. Generate an ANIMATE i2v clip with KIE Kling 3.0 using the avatar image → clip produced.
7. URL tab: paste a direct .mp4 URL (e.g. a Supabase public URL from the bucket) → analyze works.
8. Negative: paste a URL to an HTML page → friendly "did not return a video" error in the dialog.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/BottomControlBar.tsx"
git commit -m "feat(avatar-studio): From Video button wires VideoToPromptDialog into prompt bar"
```
