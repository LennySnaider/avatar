# Voice & Script Studio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add voice cloning (MiniMax Speech 2.8 HD), script generation (Gemini), TTS, and audio-video merge to Prime Avatar — completing the end-to-end pipeline from idea to published video with personalized voice.

**Architecture:** Three new server-side services (MiniMaxService, ScriptService, AudioMergeService) exposed via Next.js API routes, backed by two new Supabase tables (cloned_voices, audio_scripts). A new Voice Studio UI page lets users manage voices, write scripts, preview audio, and merge with generated videos. Follows existing patterns: `'use server'` services, Supabase with service role client, Zustand stores.

**Tech Stack:** Next.js 15 (App Router), TypeScript, MiniMax Speech 2.8 HD API, Google Gemini (@google/genai), FFmpeg (server-side via @ffmpeg/ffmpeg), Supabase (PostgreSQL + Storage), Zustand 5, Tailwind CSS 4, React 19.

**Spec reference:** `docs/superpowers/specs/2026-04-07-prime-avatar-ecosystem-design.md` — Section 2.4 Voice & Script Studio.

---

## File Structure

### New files to create:

| File | Responsibility |
|------|---------------|
| `src/services/MiniMaxService.ts` | Voice clone + TTS via MiniMax API (server action) |
| `src/services/ScriptService.ts` | Script generation via Gemini with templates (server action) |
| `src/services/AudioMergeService.ts` | Merge audio track + video file via FFmpeg (server action) |
| `src/@types/minimax.ts` | TypeScript types for MiniMax API requests/responses |
| `src/@types/voice.ts` | Types for voice studio: ClonedVoice, AudioScript, VoiceStudioState |
| `src/app/api/voice/clone/route.ts` | API route: upload audio + clone voice |
| `src/app/api/voice/tts/route.ts` | API route: generate speech from text + voice |
| `src/app/api/voice/list/route.ts` | API route: list cloned voices for user |
| `src/app/api/voice/delete/route.ts` | API route: delete a cloned voice |
| `src/app/api/script/generate/route.ts` | API route: generate script from context |
| `src/app/api/audio/merge/route.ts` | API route: merge audio + video |
| `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/page.tsx` | Voice Studio page (server component) |
| `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_store/voiceStudioStore.ts` | Zustand store for voice studio state |
| `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/VoiceStudioMain.tsx` | Main orchestrator component |
| `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/VoiceLibrary.tsx` | List/manage cloned voices |
| `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/VoiceClonePanel.tsx` | Upload audio + clone voice UI |
| `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/ScriptEditor.tsx` | Write/generate/edit scripts |
| `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/AudioPreview.tsx` | Preview TTS audio playback |
| `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/AudioMergePanel.tsx` | Select video + audio → merge |

### Existing files to modify:

| File | Change |
|------|--------|
| `src/@types/supabase.ts` | Add `cloned_voices` and `audio_scripts` table types |
| `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/AvatarStudioMain.tsx` | Add "Generate with Voice" button that links to voice studio |
| `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/GenerationControls.tsx` | Add voice selector dropdown (select from cloned voices) |

---

## Task 1: MiniMax TypeScript Types

**Files:**
- Create: `src/@types/minimax.ts`

- [ ] **Step 1: Create MiniMax API types**

```typescript
// src/@types/minimax.ts

// ─── File Upload ───────────────────────────────────────────
export interface MiniMaxFileUploadResponse {
    file: {
        file_id: string
        filename: string
        bytes: number
        created_at: number
        purpose: string
    }
    base_resp: {
        status_code: number
        status_msg: string
    }
}

// ─── Voice Clone ───────────────────────────────────────────
export interface MiniMaxVoiceCloneRequest {
    file_id: string
    voice_id: string
    /** Optional preview text, max 300 chars */
    text?: string
    model?: 'speech-2.8-hd' | 'speech-2.6-hd' | 'speech-02-hd'
    need_noise_reduction?: boolean
    need_volume_normalization?: boolean
    accuracy?: number
}

export interface MiniMaxVoiceCloneResponse {
    base_resp: {
        status_code: number
        status_msg: string
    }
    /** Hex-encoded preview audio (if text was provided) */
    data?: {
        audio?: string
    }
}

// ─── Text-to-Audio (T2A) ──────────────────────────────────
export type MiniMaxTTSModel =
    | 'speech-2.8-hd'
    | 'speech-2.8-turbo'
    | 'speech-2.6-hd'
    | 'speech-2.6-turbo'
    | 'speech-02-hd'
    | 'speech-02-turbo'

export type MiniMaxEmotion =
    | 'happy' | 'sad' | 'angry' | 'fearful'
    | 'disgusted' | 'surprised' | 'calm'
    | 'fluent' | 'whisper'

export type MiniMaxAudioFormat = 'mp3' | 'pcm' | 'flac' | 'wav'

export interface MiniMaxTTSRequest {
    model: MiniMaxTTSModel
    text: string
    stream?: boolean
    output_format?: 'url' | 'hex'
    language_boost?: string | null
    voice_setting: {
        voice_id: string
        speed?: number      // 0.5-2, default 1.0
        vol?: number        // 0-10, default 1.0
        pitch?: number      // -12 to 12, default 0
        emotion?: MiniMaxEmotion
    }
    audio_setting?: {
        sample_rate?: 8000 | 16000 | 22050 | 24000 | 32000 | 44100
        bitrate?: 32000 | 64000 | 128000 | 256000
        format?: MiniMaxAudioFormat
        channel?: 1 | 2
    }
}

export interface MiniMaxTTSResponse {
    data: {
        audio: string   // hex-encoded audio bytes
        status: 1 | 2   // 1=synthesizing, 2=completed
    }
    extra_info: {
        audio_length: number     // ms
        audio_sample_rate: number
        audio_size: number       // bytes
        bitrate: number
        audio_format: string
        audio_channel: number
        usage_characters: number
        word_count: number
    }
    trace_id: string
    base_resp: {
        status_code: number
        status_msg: string
    }
}

// ─── Error codes ───────────────────────────────────────────
export const MINIMAX_ERROR_CODES: Record<number, string> = {
    0: 'Success',
    1000: 'Unknown error',
    1001: 'Timeout',
    1002: 'Rate limit exceeded',
    1004: 'Authentication failure',
    1042: 'Illegal characters exceeded 10%',
} as const
```

- [ ] **Step 2: Commit**

```bash
git add src/@types/minimax.ts
git commit -m "feat: add MiniMax API TypeScript types for voice clone and TTS"
```

---

## Task 2: Voice & Script Database Types

**Files:**
- Create: `src/@types/voice.ts`
- Modify: `src/@types/supabase.ts`

- [ ] **Step 1: Create voice studio types**

```typescript
// src/@types/voice.ts

export interface ClonedVoice {
    id: string
    user_id: string
    avatar_id: string | null
    name: string
    provider: 'minimax'
    provider_voice_id: string
    sample_audio_url: string
    language: string
    status: 'cloning' | 'ready' | 'failed'
    created_at: string
    updated_at: string
}

export type ClonedVoiceInsert = Omit<ClonedVoice, 'id' | 'created_at' | 'updated_at'>
export type ClonedVoiceUpdate = Partial<Pick<ClonedVoice, 'name' | 'avatar_id' | 'status'>>

export type ScriptTone = 'professional' | 'casual' | 'funny' | 'persuasive'
export type ScriptTemplate =
    | 'property-tour' | 'product-review' | 'ugc-ad'
    | 'greeting' | 'tutorial' | 'custom'

export interface AudioScript {
    id: string
    user_id: string
    generation_id: string | null
    title: string
    script_text: string
    language: string
    tone: ScriptTone
    duration_target_seconds: number
    template_type: ScriptTemplate
    context: Record<string, unknown>
    created_at: string
}

export type AudioScriptInsert = Omit<AudioScript, 'id' | 'created_at'>

export interface ScriptGenerateParams {
    template: ScriptTemplate
    tone: ScriptTone
    language: string
    durationSeconds: number
    context: {
        productName?: string
        productDescription?: string
        targetAudience?: string
        cta?: string
        customInstructions?: string
    }
}

export interface VoiceStudioState {
    // Voices
    voices: ClonedVoice[]
    selectedVoiceId: string | null
    isCloning: boolean

    // Scripts
    scripts: AudioScript[]
    currentScript: string
    currentTitle: string
    scriptTone: ScriptTone
    scriptTemplate: ScriptTemplate
    scriptLanguage: string
    durationTarget: number
    isGeneratingScript: boolean

    // TTS Preview
    previewAudioUrl: string | null
    isGeneratingAudio: boolean

    // Merge
    selectedVideoUrl: string | null
    mergedVideoUrl: string | null
    isMerging: boolean

    // Actions
    setVoices: (voices: ClonedVoice[]) => void
    setSelectedVoiceId: (id: string | null) => void
    setIsCloning: (v: boolean) => void
    setScripts: (scripts: AudioScript[]) => void
    setCurrentScript: (text: string) => void
    setCurrentTitle: (title: string) => void
    setScriptTone: (tone: ScriptTone) => void
    setScriptTemplate: (template: ScriptTemplate) => void
    setScriptLanguage: (lang: string) => void
    setDurationTarget: (secs: number) => void
    setIsGeneratingScript: (v: boolean) => void
    setPreviewAudioUrl: (url: string | null) => void
    setIsGeneratingAudio: (v: boolean) => void
    setSelectedVideoUrl: (url: string | null) => void
    setMergedVideoUrl: (url: string | null) => void
    setIsMerging: (v: boolean) => void
    reset: () => void
}
```

- [ ] **Step 2: Add table types to supabase.ts**

Add the following types at the end of `src/@types/supabase.ts`, before the closing of the Database type (or as standalone exports if the file uses flat exports):

```typescript
// ─── Voice Studio Tables ───────────────────────────────────

export interface DbClonedVoice {
    id: string
    user_id: string
    avatar_id: string | null
    name: string
    provider: string
    provider_voice_id: string
    sample_audio_url: string
    language: string
    status: string
    created_at: string
    updated_at: string
}

export interface DbAudioScript {
    id: string
    user_id: string
    generation_id: string | null
    title: string
    script_text: string
    language: string
    tone: string
    duration_target_seconds: number
    template_type: string
    context: Record<string, unknown>
    created_at: string
}
```

- [ ] **Step 3: Commit**

```bash
git add src/@types/voice.ts src/@types/supabase.ts
git commit -m "feat: add voice studio and Supabase table types"
```

---

## Task 3: Supabase Migration — cloned_voices & audio_scripts Tables

**Files:**
- Create migration via Supabase MCP or SQL file

- [ ] **Step 1: Run migration SQL**

Execute this SQL in Supabase (via MCP tool `mcp__supabase__execute_sql` or dashboard):

```sql
-- Voice Studio tables for Prime Avatar

CREATE TABLE IF NOT EXISTS cloned_voices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    avatar_id UUID REFERENCES avatars(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'minimax',
    provider_voice_id TEXT NOT NULL,
    sample_audio_url TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'es',
    status TEXT NOT NULL DEFAULT 'cloning',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT cloned_voices_status_check CHECK (status IN ('cloning', 'ready', 'failed'))
);

CREATE TABLE IF NOT EXISTS audio_scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    generation_id UUID REFERENCES generations(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    script_text TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'es',
    tone TEXT NOT NULL DEFAULT 'professional',
    duration_target_seconds INTEGER NOT NULL DEFAULT 30,
    template_type TEXT NOT NULL DEFAULT 'custom',
    context JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT audio_scripts_tone_check CHECK (tone IN ('professional', 'casual', 'funny', 'persuasive')),
    CONSTRAINT audio_scripts_template_check CHECK (template_type IN ('property-tour', 'product-review', 'ugc-ad', 'greeting', 'tutorial', 'custom'))
);

-- Indexes
CREATE INDEX idx_cloned_voices_user_id ON cloned_voices(user_id);
CREATE INDEX idx_audio_scripts_user_id ON audio_scripts(user_id);

-- Updated_at trigger for cloned_voices
CREATE OR REPLACE FUNCTION update_cloned_voices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cloned_voices_updated_at
    BEFORE UPDATE ON cloned_voices
    FOR EACH ROW
    EXECUTE FUNCTION update_cloned_voices_updated_at();
```

- [ ] **Step 2: Verify tables exist**

Run: `SELECT table_name FROM information_schema.tables WHERE table_name IN ('cloned_voices', 'audio_scripts');`

Expected: Both tables listed.

- [ ] **Step 3: Commit** (if using a local migration file)

```bash
git add supabase/migrations/
git commit -m "feat: add cloned_voices and audio_scripts tables"
```

---

## Task 4: MiniMaxService — Voice Clone + TTS

**Files:**
- Create: `src/services/MiniMaxService.ts`

- [ ] **Step 1: Implement MiniMaxService**

```typescript
// src/services/MiniMaxService.ts
'use server'

import type {
    MiniMaxFileUploadResponse,
    MiniMaxVoiceCloneRequest,
    MiniMaxVoiceCloneResponse,
    MiniMaxTTSRequest,
    MiniMaxTTSResponse,
} from '@/@types/minimax'

const MINIMAX_API_BASE = 'https://api.minimax.io/v1'

function getApiKey(): string {
    const key = process.env.MINIMAX_API_KEY
    if (!key) throw new Error('MINIMAX_API_KEY is not defined')
    return key
}

function authHeaders(): Record<string, string> {
    return {
        Authorization: `Bearer ${getApiKey()}`,
    }
}

// ─── File Upload (for voice cloning) ──────────────────────

export async function uploadAudioForCloning(
    audioBuffer: Buffer,
    filename: string
): Promise<string> {
    const formData = new FormData()
    formData.append('purpose', 'voice_clone')
    formData.append('file', new Blob([audioBuffer]), filename)

    const res = await fetch(`${MINIMAX_API_BASE}/files/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
    })

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`MiniMax file upload failed (${res.status}): ${text}`)
    }

    const json: MiniMaxFileUploadResponse = await res.json()
    if (json.base_resp.status_code !== 0) {
        throw new Error(`MiniMax file upload error: ${json.base_resp.status_msg}`)
    }

    return json.file.file_id
}

// ─── Voice Clone ──────────────────────────────────────────

export async function cloneVoice(
    fileId: string,
    voiceId: string,
    previewText?: string
): Promise<MiniMaxVoiceCloneResponse> {
    const body: MiniMaxVoiceCloneRequest = {
        file_id: fileId,
        voice_id: voiceId,
        model: 'speech-2.8-hd',
        need_noise_reduction: true,
        need_volume_normalization: true,
    }
    if (previewText) {
        body.text = previewText.slice(0, 300)
    }

    const res = await fetch(`${MINIMAX_API_BASE}/voice_clone`, {
        method: 'POST',
        headers: {
            ...authHeaders(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    })

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`MiniMax voice clone failed (${res.status}): ${text}`)
    }

    const json: MiniMaxVoiceCloneResponse = await res.json()
    if (json.base_resp.status_code !== 0) {
        throw new Error(`MiniMax voice clone error: ${json.base_resp.status_msg}`)
    }

    return json
}

// ─── Text-to-Speech ───────────────────────────────────────

export async function textToSpeech(params: {
    text: string
    voiceId: string
    speed?: number
    pitch?: number
    emotion?: MiniMaxTTSRequest['voice_setting']['emotion']
    language?: string
}): Promise<{ audioBuffer: Buffer; durationMs: number; characters: number }> {
    const body: MiniMaxTTSRequest = {
        model: 'speech-2.8-hd',
        text: params.text,
        stream: false,
        output_format: 'hex',
        language_boost: params.language || null,
        voice_setting: {
            voice_id: params.voiceId,
            speed: params.speed ?? 1.0,
            vol: 1.0,
            pitch: params.pitch ?? 0,
            emotion: params.emotion,
        },
        audio_setting: {
            sample_rate: 32000,
            bitrate: 128000,
            format: 'mp3',
            channel: 1,
        },
    }

    const res = await fetch(`${MINIMAX_API_BASE}/t2a_v2`, {
        method: 'POST',
        headers: {
            ...authHeaders(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    })

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`MiniMax TTS failed (${res.status}): ${text}`)
    }

    const json: MiniMaxTTSResponse = await res.json()
    if (json.base_resp.status_code !== 0) {
        throw new Error(`MiniMax TTS error: ${json.base_resp.status_msg}`)
    }

    // Convert hex string to Buffer
    const audioBuffer = Buffer.from(json.data.audio, 'hex')

    return {
        audioBuffer,
        durationMs: json.extra_info.audio_length,
        characters: json.extra_info.usage_characters,
    }
}

// ─── Generate voice_id from user input ────────────────────

/** MiniMax requires: min 8 chars, starts with letter, alphanumeric only */
export function generateVoiceId(userId: string, voiceName: string): string {
    const clean = voiceName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    const prefix = clean.length >= 4 ? clean.slice(0, 4) : 'voice'
    const suffix = userId.replace(/-/g, '').slice(0, 8)
    const ts = Date.now().toString(36)
    return `pa${prefix}${suffix}${ts}`
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/MiniMaxService.ts
git commit -m "feat: add MiniMaxService for voice cloning and TTS"
```

---

## Task 5: ScriptService — AI Script Generation

**Files:**
- Create: `src/services/ScriptService.ts`

- [ ] **Step 1: Implement ScriptService**

```typescript
// src/services/ScriptService.ts
'use server'

import { GoogleGenAI } from '@google/genai'
import type { ScriptGenerateParams, ScriptTone, ScriptTemplate } from '@/@types/voice'

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

const TONE_DESCRIPTIONS: Record<ScriptTone, string> = {
    professional: 'Professional, trustworthy, and authoritative. Clear and concise language.',
    casual: 'Friendly, conversational, and approachable. Like talking to a friend.',
    funny: 'Humorous, witty, and entertaining. Light-hearted with clever wordplay.',
    persuasive: 'Compelling, urgent, and action-oriented. Strong call-to-action.',
}

const TEMPLATE_STRUCTURES: Record<ScriptTemplate, string> = {
    'property-tour': `Structure:
1. Hook (2-3 seconds): Attention-grabbing opening about the property
2. Location & Overview (5-8 seconds): Neighborhood, area highlights
3. Key Features (10-15 seconds): Bedrooms, size, unique amenities
4. Lifestyle Appeal (5-8 seconds): Who this property is perfect for
5. CTA (3-5 seconds): Contact info or next step`,

    'product-review': `Structure:
1. Hook (2-3 seconds): "I tested [product] and here's what happened"
2. First Impression (5 seconds): Unboxing/initial reaction
3. Key Benefits (10 seconds): Top 3 features with real examples
4. Honest Opinion (5 seconds): Pros and any minor cons
5. Verdict + CTA (5 seconds): Rating and where to buy`,

    'ugc-ad': `Structure:
1. Hook (2-3 seconds): Relatable problem statement
2. Discovery (3-5 seconds): "I found [product/service]"
3. Experience (10-15 seconds): Personal story using it
4. Results (5 seconds): Before/after or concrete outcome
5. CTA (3-5 seconds): "Use my code" or "Link in bio"`,

    'greeting': `Structure:
1. Warm Hello (3 seconds): Personal greeting
2. Introduction (5 seconds): Who you are and what you do
3. Value Proposition (5-10 seconds): How you can help
4. Invitation (5 seconds): Next step or how to connect`,

    'tutorial': `Structure:
1. What You'll Learn (3 seconds): Clear promise
2. Step 1 (8-10 seconds): First action with explanation
3. Step 2 (8-10 seconds): Second action
4. Step 3 (8-10 seconds): Third action
5. Recap + CTA (5 seconds): Summary and next steps`,

    'custom': `Structure: Free-form. Write a natural, flowing script based on the context provided.`,
}

export async function generateScript(params: ScriptGenerateParams): Promise<string> {
    const { template, tone, language, durationSeconds, context } = params

    const wordsPerSecond = language === 'es' ? 2.5 : 3.0
    const targetWords = Math.round(durationSeconds * wordsPerSecond)

    const prompt = `You are a professional scriptwriter for short-form video content.

TASK: Write a script for a ${durationSeconds}-second video (approximately ${targetWords} words).

TONE: ${TONE_DESCRIPTIONS[tone]}

TEMPLATE: ${template}
${TEMPLATE_STRUCTURES[template]}

CONTEXT:
${context.productName ? `- Product/Subject: ${context.productName}` : ''}
${context.productDescription ? `- Description: ${context.productDescription}` : ''}
${context.targetAudience ? `- Target Audience: ${context.targetAudience}` : ''}
${context.cta ? `- Call to Action: ${context.cta}` : ''}
${context.customInstructions ? `- Additional Instructions: ${context.customInstructions}` : ''}

LANGUAGE: Write the entire script in ${language === 'es' ? 'Spanish (Latin American)' : language === 'en' ? 'English' : language}.

RULES:
- Write ONLY the spoken text, no stage directions or [brackets]
- Keep it exactly around ${targetWords} words (${durationSeconds} seconds when spoken)
- Make every word count — no filler phrases
- End with a clear call-to-action
- Sound natural when read aloud, not written

OUTPUT: Return ONLY the script text, nothing else.`

    const response = await genAI.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
    })

    const text = response.text?.trim()
    if (!text) throw new Error('Gemini returned empty script')

    return text
}

export async function translateScript(
    scriptText: string,
    fromLanguage: string,
    toLanguage: string
): Promise<string> {
    const prompt = `Translate this video script from ${fromLanguage} to ${toLanguage}.
Keep the same tone, rhythm, and natural spoken feel. Adapt cultural references if needed.
Do NOT add any notes or explanations — return ONLY the translated script.

Script:
${scriptText}`

    const response = await genAI.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
    })

    const text = response.text?.trim()
    if (!text) throw new Error('Gemini returned empty translation')

    return text
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/ScriptService.ts
git commit -m "feat: add ScriptService for AI script generation with Gemini"
```

---

## Task 6: AudioMergeService — Merge Audio + Video

**Files:**
- Create: `src/services/AudioMergeService.ts`

- [ ] **Step 1: Implement AudioMergeService**

```typescript
// src/services/AudioMergeService.ts
'use server'

import { createServerSupabaseClient } from '@/lib/supabase'
import { v4 as uuidv4 } from 'uuid'

/**
 * Merges an audio track with a video by calling FFmpeg via a temporary
 * server-side process. Uses Supabase Storage for input/output.
 *
 * Strategy: Upload both files to a temp location, call FFmpeg CLI
 * to merge, upload result, clean up temps.
 *
 * NOTE: This requires FFmpeg installed on the server (Vercel Functions
 * have a 250MB limit — for production, use a dedicated media processing
 * service or a serverless FFmpeg layer). For MVP, we use the /tmp
 * directory available in serverless functions.
 */
export async function mergeAudioVideo(params: {
    videoUrl: string
    audioBuffer: Buffer
    userId: string
    outputFilename?: string
}): Promise<{ storagePath: string; publicUrl: string }> {
    const { videoUrl, audioBuffer, userId, outputFilename } = params
    const supabase = createServerSupabaseClient()

    // 1. Upload audio to temp storage
    const tempAudioPath = `temp/${userId}/${uuidv4()}.mp3`
    const { error: audioUploadError } = await supabase.storage
        .from('generations')
        .upload(tempAudioPath, audioBuffer, {
            contentType: 'audio/mpeg',
            upsert: true,
        })
    if (audioUploadError) {
        throw new Error(`Failed to upload temp audio: ${audioUploadError.message}`)
    }

    // 2. Get signed URLs for both files
    const { data: audioSignedUrl } = await supabase.storage
        .from('generations')
        .createSignedUrl(tempAudioPath, 300)

    if (!audioSignedUrl?.signedUrl) {
        throw new Error('Failed to get signed URL for audio')
    }

    // 3. Call external merge endpoint or use FFmpeg
    // For MVP: download both, merge with FFmpeg via child_process, upload result
    const { execSync } = await import('child_process')
    const { writeFileSync, readFileSync, unlinkSync, mkdirSync, existsSync } = await import('fs')
    const path = await import('path')

    const tmpDir = '/tmp/audio-merge'
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })

    const jobId = uuidv4()
    const tmpVideo = path.join(tmpDir, `${jobId}-video.mp4`)
    const tmpAudio = path.join(tmpDir, `${jobId}-audio.mp3`)
    const tmpOutput = path.join(tmpDir, `${jobId}-output.mp4`)

    try {
        // Download video
        const videoRes = await fetch(videoUrl)
        const videoArrayBuffer = await videoRes.arrayBuffer()
        writeFileSync(tmpVideo, Buffer.from(videoArrayBuffer))

        // Write audio
        writeFileSync(tmpAudio, audioBuffer)

        // Merge: replace audio track in video with our TTS audio
        // -shortest: cut to shorter of the two streams
        execSync(
            `ffmpeg -y -i "${tmpVideo}" -i "${tmpAudio}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${tmpOutput}"`,
            { timeout: 60000 }
        )

        // Read merged file
        const mergedBuffer = readFileSync(tmpOutput)

        // Upload to Supabase Storage
        const finalPath = `${userId}/videos/${outputFilename || `merged-${jobId}.mp4`}`
        const { error: uploadError } = await supabase.storage
            .from('generations')
            .upload(finalPath, mergedBuffer, {
                contentType: 'video/mp4',
                upsert: true,
            })

        if (uploadError) {
            throw new Error(`Failed to upload merged video: ${uploadError.message}`)
        }

        const { data: publicUrlData } = supabase.storage
            .from('generations')
            .getPublicUrl(finalPath)

        return {
            storagePath: finalPath,
            publicUrl: publicUrlData.publicUrl,
        }
    } finally {
        // Cleanup temp files
        const cleanup = [tmpVideo, tmpAudio, tmpOutput, tempAudioPath]
        for (const f of [tmpVideo, tmpAudio, tmpOutput]) {
            try { unlinkSync(f) } catch { /* ignore */ }
        }
        // Cleanup temp audio from storage
        await supabase.storage.from('generations').remove([tempAudioPath])
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/AudioMergeService.ts
git commit -m "feat: add AudioMergeService for FFmpeg audio-video merge"
```

---

## Task 7: API Routes — Voice Clone + TTS

**Files:**
- Create: `src/app/api/voice/clone/route.ts`
- Create: `src/app/api/voice/tts/route.ts`
- Create: `src/app/api/voice/list/route.ts`
- Create: `src/app/api/voice/delete/route.ts`

- [ ] **Step 1: Voice clone route**

```typescript
// src/app/api/voice/clone/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/configs/auth.config'
import { createServerSupabaseClient } from '@/lib/supabase'
import { uploadAudioForCloning, cloneVoice, generateVoiceId } from '@/services/MiniMaxService'

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const audioFile = formData.get('audio') as File | null
    const name = formData.get('name') as string
    const language = (formData.get('language') as string) || 'es'
    const avatarId = formData.get('avatarId') as string | null

    if (!audioFile || !name) {
        return NextResponse.json({ error: 'audio and name are required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    const userId = session.user.id

    try {
        // 1. Upload to Supabase Storage (keep original)
        const storagePath = `${userId}/voices/${Date.now()}-${audioFile.name}`
        const audioBuffer = Buffer.from(await audioFile.arrayBuffer())

        const { error: storageError } = await supabase.storage
            .from('avatars')
            .upload(storagePath, audioBuffer, {
                contentType: audioFile.type,
                upsert: true,
            })
        if (storageError) throw new Error(storageError.message)

        const { data: publicUrlData } = supabase.storage
            .from('avatars')
            .getPublicUrl(storagePath)

        // 2. Upload to MiniMax
        const fileId = await uploadAudioForCloning(audioBuffer, audioFile.name)

        // 3. Clone voice
        const voiceId = generateVoiceId(userId, name)
        await cloneVoice(fileId, voiceId, `Hola, esta es una prueba de mi voz clonada.`)

        // 4. Save to DB
        const { data: voice, error: dbError } = await supabase
            .from('cloned_voices')
            .insert({
                user_id: userId,
                avatar_id: avatarId || null,
                name,
                provider: 'minimax',
                provider_voice_id: voiceId,
                sample_audio_url: publicUrlData.publicUrl,
                language,
                status: 'ready',
            })
            .select()
            .single()

        if (dbError) throw new Error(dbError.message)

        return NextResponse.json({ success: true, voice })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Voice cloning failed'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
```

- [ ] **Step 2: TTS route**

```typescript
// src/app/api/voice/tts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/configs/auth.config'
import { textToSpeech } from '@/services/MiniMaxService'

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { text, voiceId, speed, pitch, emotion, language } = body

    if (!text || !voiceId) {
        return NextResponse.json({ error: 'text and voiceId are required' }, { status: 400 })
    }

    if (text.length > 10000) {
        return NextResponse.json({ error: 'Text exceeds 10,000 character limit' }, { status: 400 })
    }

    try {
        const { audioBuffer, durationMs, characters } = await textToSpeech({
            text,
            voiceId,
            speed,
            pitch,
            emotion,
            language,
        })

        // Return audio as base64 for easy client consumption
        const base64Audio = audioBuffer.toString('base64')

        return NextResponse.json({
            success: true,
            audio: base64Audio,
            durationMs,
            characters,
            mimeType: 'audio/mpeg',
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'TTS generation failed'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
```

- [ ] **Step 3: List voices route**

```typescript
// src/app/api/voice/list/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/configs/auth.config'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET() {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()

    const { data: voices, error } = await supabase
        .from('cloned_voices')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('status', 'ready')
        .order('created_at', { ascending: false })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ voices })
}
```

- [ ] **Step 4: Delete voice route**

```typescript
// src/app/api/voice/delete/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/configs/auth.config'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function DELETE(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
        .from('cloned_voices')
        .delete()
        .eq('id', id)
        .eq('user_id', session.user.id)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/voice/
git commit -m "feat: add API routes for voice clone, TTS, list, delete"
```

---

## Task 8: API Routes — Script Generation + Audio Merge

**Files:**
- Create: `src/app/api/script/generate/route.ts`
- Create: `src/app/api/audio/merge/route.ts`

- [ ] **Step 1: Script generation route**

```typescript
// src/app/api/script/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/configs/auth.config'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateScript } from '@/services/ScriptService'
import type { ScriptGenerateParams } from '@/@types/voice'

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: ScriptGenerateParams & { title?: string; save?: boolean } = await req.json()
    const { template, tone, language, durationSeconds, context, title, save } = body

    if (!template || !tone || !language || !durationSeconds) {
        return NextResponse.json(
            { error: 'template, tone, language, and durationSeconds are required' },
            { status: 400 }
        )
    }

    try {
        const scriptText = await generateScript({
            template,
            tone,
            language,
            durationSeconds,
            context: context || {},
        })

        // Optionally save to DB
        let savedScript = null
        if (save) {
            const supabase = createServerSupabaseClient()
            const { data, error } = await supabase
                .from('audio_scripts')
                .insert({
                    user_id: session.user.id,
                    title: title || `${template} script`,
                    script_text: scriptText,
                    language,
                    tone,
                    duration_target_seconds: durationSeconds,
                    template_type: template,
                    context: context || {},
                })
                .select()
                .single()

            if (error) throw new Error(error.message)
            savedScript = data
        }

        return NextResponse.json({
            success: true,
            script: scriptText,
            saved: savedScript,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Script generation failed'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
```

- [ ] **Step 2: Audio merge route**

```typescript
// src/app/api/audio/merge/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/configs/auth.config'
import { mergeAudioVideo } from '@/services/AudioMergeService'

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { videoUrl, audioBase64, outputFilename } = body

    if (!videoUrl || !audioBase64) {
        return NextResponse.json(
            { error: 'videoUrl and audioBase64 are required' },
            { status: 400 }
        )
    }

    try {
        const audioBuffer = Buffer.from(audioBase64, 'base64')

        const result = await mergeAudioVideo({
            videoUrl,
            audioBuffer,
            userId: session.user.id,
            outputFilename,
        })

        return NextResponse.json({
            success: true,
            ...result,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Audio merge failed'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/script/ src/app/api/audio/
git commit -m "feat: add API routes for script generation and audio-video merge"
```

---

## Task 9: Zustand Store — Voice Studio State

**Files:**
- Create: `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_store/voiceStudioStore.ts`

- [ ] **Step 1: Create the store**

```typescript
// src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_store/voiceStudioStore.ts
import { create } from 'zustand'
import type { VoiceStudioState, ClonedVoice, AudioScript, ScriptTone, ScriptTemplate } from '@/@types/voice'

const initialState = {
    voices: [] as ClonedVoice[],
    selectedVoiceId: null as string | null,
    isCloning: false,
    scripts: [] as AudioScript[],
    currentScript: '',
    currentTitle: '',
    scriptTone: 'professional' as ScriptTone,
    scriptTemplate: 'custom' as ScriptTemplate,
    scriptLanguage: 'es',
    durationTarget: 30,
    isGeneratingScript: false,
    previewAudioUrl: null as string | null,
    isGeneratingAudio: false,
    selectedVideoUrl: null as string | null,
    mergedVideoUrl: null as string | null,
    isMerging: false,
}

export const useVoiceStudioStore = create<VoiceStudioState>((set) => ({
    ...initialState,
    setVoices: (voices) => set({ voices }),
    setSelectedVoiceId: (id) => set({ selectedVoiceId: id }),
    setIsCloning: (v) => set({ isCloning: v }),
    setScripts: (scripts) => set({ scripts }),
    setCurrentScript: (text) => set({ currentScript: text }),
    setCurrentTitle: (title) => set({ currentTitle: title }),
    setScriptTone: (tone) => set({ scriptTone: tone }),
    setScriptTemplate: (template) => set({ scriptTemplate: template }),
    setScriptLanguage: (lang) => set({ scriptLanguage: lang }),
    setDurationTarget: (secs) => set({ durationTarget: secs }),
    setIsGeneratingScript: (v) => set({ isGeneratingScript: v }),
    setPreviewAudioUrl: (url) => set({ previewAudioUrl: url }),
    setIsGeneratingAudio: (v) => set({ isGeneratingAudio: v }),
    setSelectedVideoUrl: (url) => set({ selectedVideoUrl: url }),
    setMergedVideoUrl: (url) => set({ mergedVideoUrl: url }),
    setIsMerging: (v) => set({ isMerging: v }),
    reset: () => set(initialState),
}))
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(protected-pages\)/concepts/avatar-forge/voice-studio/
git commit -m "feat: add Zustand store for voice studio state"
```

---

## Task 10: Voice Studio Page + Main Component

**Files:**
- Create: `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/page.tsx`
- Create: `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/VoiceStudioMain.tsx`

- [ ] **Step 1: Server page component**

```typescript
// src/app/(protected-pages)/concepts/avatar-forge/voice-studio/page.tsx
import { auth } from '@/configs/auth.config'
import { redirect } from 'next/navigation'
import VoiceStudioMain from './_components/VoiceStudioMain'

export default async function VoiceStudioPage() {
    const session = await auth()
    if (!session?.user?.id) redirect('/sign-in')

    return <VoiceStudioMain userId={session.user.id} />
}
```

- [ ] **Step 2: Main orchestrator component**

```tsx
// src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/VoiceStudioMain.tsx
'use client'

import { useEffect } from 'react'
import { useVoiceStudioStore } from '../_store/voiceStudioStore'
import VoiceLibrary from './VoiceLibrary'
import VoiceClonePanel from './VoiceClonePanel'
import ScriptEditor from './ScriptEditor'
import AudioPreview from './AudioPreview'
import AudioMergePanel from './AudioMergePanel'
import type { ClonedVoice } from '@/@types/voice'

interface Props {
    userId: string
}

export default function VoiceStudioMain({ userId }: Props) {
    const { setVoices } = useVoiceStudioStore()

    useEffect(() => {
        async function loadVoices() {
            const res = await fetch('/api/voice/list')
            if (res.ok) {
                const { voices } = await res.json() as { voices: ClonedVoice[] }
                setVoices(voices)
            }
        }
        loadVoices()
    }, [setVoices])

    return (
        <div className="flex flex-col gap-6 p-4">
            <h1 className="text-2xl font-bold">Voice & Script Studio</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left column: Voice management */}
                <div className="flex flex-col gap-4">
                    <VoiceClonePanel userId={userId} />
                    <VoiceLibrary />
                </div>

                {/* Center column: Script editor */}
                <div className="flex flex-col gap-4">
                    <ScriptEditor />
                </div>

                {/* Right column: Preview & merge */}
                <div className="flex flex-col gap-4">
                    <AudioPreview />
                    <AudioMergePanel userId={userId} />
                </div>
            </div>
        </div>
    )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(protected-pages\)/concepts/avatar-forge/voice-studio/
git commit -m "feat: add Voice Studio page and main component"
```

---

## Task 11: VoiceClonePanel + VoiceLibrary Components

**Files:**
- Create: `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/VoiceClonePanel.tsx`
- Create: `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/VoiceLibrary.tsx`

- [ ] **Step 1: VoiceClonePanel**

```tsx
// src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/VoiceClonePanel.tsx
'use client'

import { useState, useRef } from 'react'
import { useVoiceStudioStore } from '../_store/voiceStudioStore'
import { Button, Input, Card } from '@/components/ui'

interface Props {
    userId: string
}

export default function VoiceClonePanel({ userId }: Props) {
    const { setVoices, voices, setIsCloning, isCloning } = useVoiceStudioStore()
    const [name, setName] = useState('')
    const [language, setLanguage] = useState('es')
    const [audioFile, setAudioFile] = useState<File | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleClone = async () => {
        if (!audioFile || !name) return

        setIsCloning(true)
        try {
            const formData = new FormData()
            formData.append('audio', audioFile)
            formData.append('name', name)
            formData.append('language', language)

            const res = await fetch('/api/voice/clone', {
                method: 'POST',
                body: formData,
            })

            if (!res.ok) {
                const { error } = await res.json()
                throw new Error(error)
            }

            const { voice } = await res.json()
            setVoices([voice, ...voices])
            setName('')
            setAudioFile(null)
            if (fileInputRef.current) fileInputRef.current.value = ''
        } catch (err) {
            console.error('Clone failed:', err)
        } finally {
            setIsCloning(false)
        }
    }

    return (
        <Card>
            <div className="p-4 flex flex-col gap-3">
                <h3 className="font-semibold text-lg">Clone Your Voice</h3>
                <p className="text-sm text-gray-500">
                    Upload 10s-5min of clear audio. MiniMax will clone your voice with 99%+ accuracy.
                </p>

                <Input
                    placeholder="Voice name (e.g. 'Mi voz profesional')"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />

                <select
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                >
                    <option value="es">Español</option>
                    <option value="en">English</option>
                    <option value="pt">Português</option>
                    <option value="fr">Français</option>
                </select>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mp3,.m4a,.wav"
                    onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                    className="text-sm"
                />

                {audioFile && (
                    <p className="text-xs text-gray-400">
                        {audioFile.name} ({(audioFile.size / 1024 / 1024).toFixed(1)} MB)
                    </p>
                )}

                <Button
                    onClick={handleClone}
                    loading={isCloning}
                    disabled={!audioFile || !name || isCloning}
                    variant="solid"
                    block
                >
                    {isCloning ? 'Cloning voice...' : 'Clone Voice'}
                </Button>
            </div>
        </Card>
    )
}
```

- [ ] **Step 2: VoiceLibrary**

```tsx
// src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/VoiceLibrary.tsx
'use client'

import { useVoiceStudioStore } from '../_store/voiceStudioStore'
import { Card, Button } from '@/components/ui'

export default function VoiceLibrary() {
    const { voices, selectedVoiceId, setSelectedVoiceId, setVoices } = useVoiceStudioStore()

    const handleDelete = async (id: string) => {
        const res = await fetch('/api/voice/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        })
        if (res.ok) {
            setVoices(voices.filter((v) => v.id !== id))
            if (selectedVoiceId === id) setSelectedVoiceId(null)
        }
    }

    if (voices.length === 0) {
        return (
            <Card>
                <div className="p-4 text-center text-sm text-gray-500">
                    No voices cloned yet. Upload an audio sample to get started.
                </div>
            </Card>
        )
    }

    return (
        <Card>
            <div className="p-4 flex flex-col gap-2">
                <h3 className="font-semibold text-lg">Your Voices</h3>
                {voices.map((voice) => (
                    <div
                        key={voice.id}
                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                            selectedVoiceId === voice.id
                                ? 'bg-primary/10 border border-primary'
                                : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                        onClick={() => setSelectedVoiceId(voice.id)}
                    >
                        <div className="flex flex-col">
                            <span className="font-medium text-sm">{voice.name}</span>
                            <span className="text-xs text-gray-500">
                                {voice.language.toUpperCase()} · {new Date(voice.created_at).toLocaleDateString()}
                            </span>
                        </div>
                        <Button
                            size="xs"
                            variant="plain"
                            onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(voice.id)
                            }}
                        >
                            Delete
                        </Button>
                    </div>
                ))}
            </div>
        </Card>
    )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(protected-pages\)/concepts/avatar-forge/voice-studio/_components/VoiceClonePanel.tsx
git add src/app/\(protected-pages\)/concepts/avatar-forge/voice-studio/_components/VoiceLibrary.tsx
git commit -m "feat: add VoiceClonePanel and VoiceLibrary components"
```

---

## Task 12: ScriptEditor + AudioPreview + AudioMergePanel

**Files:**
- Create: `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/ScriptEditor.tsx`
- Create: `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/AudioPreview.tsx`
- Create: `src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/AudioMergePanel.tsx`

- [ ] **Step 1: ScriptEditor**

```tsx
// src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/ScriptEditor.tsx
'use client'

import { useVoiceStudioStore } from '../_store/voiceStudioStore'
import { Button, Card, Input } from '@/components/ui'
import type { ScriptTemplate, ScriptTone } from '@/@types/voice'

const TEMPLATES: { value: ScriptTemplate; label: string }[] = [
    { value: 'property-tour', label: 'Property Tour' },
    { value: 'product-review', label: 'Product Review' },
    { value: 'ugc-ad', label: 'UGC Ad' },
    { value: 'greeting', label: 'Greeting' },
    { value: 'tutorial', label: 'Tutorial' },
    { value: 'custom', label: 'Custom' },
]

const TONES: { value: ScriptTone; label: string }[] = [
    { value: 'professional', label: 'Professional' },
    { value: 'casual', label: 'Casual' },
    { value: 'funny', label: 'Funny' },
    { value: 'persuasive', label: 'Persuasive' },
]

const DURATIONS = [15, 30, 45, 60, 90]

export default function ScriptEditor() {
    const {
        currentScript, setCurrentScript,
        currentTitle, setCurrentTitle,
        scriptTone, setScriptTone,
        scriptTemplate, setScriptTemplate,
        scriptLanguage, setScriptLanguage,
        durationTarget, setDurationTarget,
        isGeneratingScript, setIsGeneratingScript,
    } = useVoiceStudioStore()

    const handleGenerate = async () => {
        setIsGeneratingScript(true)
        try {
            const res = await fetch('/api/script/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    template: scriptTemplate,
                    tone: scriptTone,
                    language: scriptLanguage,
                    durationSeconds: durationTarget,
                    context: {},
                    title: currentTitle || `${scriptTemplate} script`,
                    save: true,
                }),
            })

            if (!res.ok) throw new Error('Generation failed')
            const { script } = await res.json()
            setCurrentScript(script)
        } catch (err) {
            console.error('Script generation failed:', err)
        } finally {
            setIsGeneratingScript(false)
        }
    }

    const wordCount = currentScript.split(/\s+/).filter(Boolean).length
    const estimatedSeconds = Math.round(wordCount / (scriptLanguage === 'es' ? 2.5 : 3.0))

    return (
        <Card>
            <div className="p-4 flex flex-col gap-3">
                <h3 className="font-semibold text-lg">Script Editor</h3>

                <Input
                    placeholder="Script title"
                    value={currentTitle}
                    onChange={(e) => setCurrentTitle(e.target.value)}
                />

                <div className="grid grid-cols-2 gap-2">
                    <select
                        className="rounded-md border px-3 py-2 text-sm"
                        value={scriptTemplate}
                        onChange={(e) => setScriptTemplate(e.target.value as ScriptTemplate)}
                    >
                        {TEMPLATES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                    </select>

                    <select
                        className="rounded-md border px-3 py-2 text-sm"
                        value={scriptTone}
                        onChange={(e) => setScriptTone(e.target.value as ScriptTone)}
                    >
                        {TONES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                    </select>

                    <select
                        className="rounded-md border px-3 py-2 text-sm"
                        value={scriptLanguage}
                        onChange={(e) => setScriptLanguage(e.target.value)}
                    >
                        <option value="es">Español</option>
                        <option value="en">English</option>
                        <option value="pt">Português</option>
                    </select>

                    <select
                        className="rounded-md border px-3 py-2 text-sm"
                        value={durationTarget}
                        onChange={(e) => setDurationTarget(Number(e.target.value))}
                    >
                        {DURATIONS.map((d) => (
                            <option key={d} value={d}>{d}s</option>
                        ))}
                    </select>
                </div>

                <Button
                    onClick={handleGenerate}
                    loading={isGeneratingScript}
                    disabled={isGeneratingScript}
                    variant="solid"
                    block
                >
                    {isGeneratingScript ? 'Generating...' : 'Generate Script with AI'}
                </Button>

                <textarea
                    className="w-full min-h-[200px] rounded-md border p-3 text-sm resize-y"
                    placeholder="Write your script here or generate one with AI..."
                    value={currentScript}
                    onChange={(e) => setCurrentScript(e.target.value)}
                />

                <div className="flex justify-between text-xs text-gray-500">
                    <span>{wordCount} words</span>
                    <span>~{estimatedSeconds}s estimated</span>
                </div>
            </div>
        </Card>
    )
}
```

- [ ] **Step 2: AudioPreview**

```tsx
// src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/AudioPreview.tsx
'use client'

import { useRef } from 'react'
import { useVoiceStudioStore } from '../_store/voiceStudioStore'
import { Button, Card } from '@/components/ui'

export default function AudioPreview() {
    const {
        currentScript, selectedVoiceId, voices,
        previewAudioUrl, setPreviewAudioUrl,
        isGeneratingAudio, setIsGeneratingAudio,
        scriptLanguage,
    } = useVoiceStudioStore()
    const audioRef = useRef<HTMLAudioElement>(null)

    const selectedVoice = voices.find((v) => v.id === selectedVoiceId)

    const handleGenerateAudio = async () => {
        if (!currentScript || !selectedVoice) return

        setIsGeneratingAudio(true)
        try {
            const res = await fetch('/api/voice/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: currentScript,
                    voiceId: selectedVoice.provider_voice_id,
                    language: scriptLanguage === 'es' ? 'Spanish' : scriptLanguage === 'en' ? 'English' : scriptLanguage,
                }),
            })

            if (!res.ok) throw new Error('TTS failed')
            const { audio, mimeType } = await res.json()

            const audioUrl = `data:${mimeType};base64,${audio}`
            setPreviewAudioUrl(audioUrl)
        } catch (err) {
            console.error('TTS generation failed:', err)
        } finally {
            setIsGeneratingAudio(false)
        }
    }

    return (
        <Card>
            <div className="p-4 flex flex-col gap-3">
                <h3 className="font-semibold text-lg">Audio Preview</h3>

                {!selectedVoice && (
                    <p className="text-sm text-gray-500">Select a voice from the library first.</p>
                )}
                {selectedVoice && !currentScript && (
                    <p className="text-sm text-gray-500">Write or generate a script first.</p>
                )}

                {selectedVoice && (
                    <div className="text-sm bg-gray-50 dark:bg-gray-800 rounded-md p-2">
                        Voice: <strong>{selectedVoice.name}</strong> ({selectedVoice.language.toUpperCase()})
                    </div>
                )}

                <Button
                    onClick={handleGenerateAudio}
                    loading={isGeneratingAudio}
                    disabled={!currentScript || !selectedVoice || isGeneratingAudio}
                    variant="solid"
                    block
                >
                    {isGeneratingAudio ? 'Generating audio...' : 'Generate Audio'}
                </Button>

                {previewAudioUrl && (
                    <audio
                        ref={audioRef}
                        controls
                        src={previewAudioUrl}
                        className="w-full"
                    />
                )}
            </div>
        </Card>
    )
}
```

- [ ] **Step 3: AudioMergePanel**

```tsx
// src/app/(protected-pages)/concepts/avatar-forge/voice-studio/_components/AudioMergePanel.tsx
'use client'

import { useVoiceStudioStore } from '../_store/voiceStudioStore'
import { Button, Card, Input } from '@/components/ui'

interface Props {
    userId: string
}

export default function AudioMergePanel({ userId }: Props) {
    const {
        selectedVideoUrl, setSelectedVideoUrl,
        previewAudioUrl,
        mergedVideoUrl, setMergedVideoUrl,
        isMerging, setIsMerging,
    } = useVoiceStudioStore()

    const handleMerge = async () => {
        if (!selectedVideoUrl || !previewAudioUrl) return

        setIsMerging(true)
        try {
            // Extract base64 from data URL
            const base64Match = previewAudioUrl.match(/base64,(.+)/)
            if (!base64Match) throw new Error('Invalid audio format')

            const res = await fetch('/api/audio/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    videoUrl: selectedVideoUrl,
                    audioBase64: base64Match[1],
                }),
            })

            if (!res.ok) throw new Error('Merge failed')
            const { publicUrl } = await res.json()
            setMergedVideoUrl(publicUrl)
        } catch (err) {
            console.error('Merge failed:', err)
        } finally {
            setIsMerging(false)
        }
    }

    return (
        <Card>
            <div className="p-4 flex flex-col gap-3">
                <h3 className="font-semibold text-lg">Merge Audio + Video</h3>

                <Input
                    placeholder="Paste video URL (from gallery or Supabase)"
                    value={selectedVideoUrl || ''}
                    onChange={(e) => setSelectedVideoUrl(e.target.value)}
                />

                <Button
                    onClick={handleMerge}
                    loading={isMerging}
                    disabled={!selectedVideoUrl || !previewAudioUrl || isMerging}
                    variant="solid"
                    block
                >
                    {isMerging ? 'Merging...' : 'Merge Audio + Video'}
                </Button>

                {mergedVideoUrl && (
                    <div className="flex flex-col gap-2">
                        <video
                            controls
                            src={mergedVideoUrl}
                            className="w-full rounded-lg"
                        />
                        <a
                            href={mergedVideoUrl}
                            download
                            className="text-sm text-primary underline text-center"
                        >
                            Download merged video
                        </a>
                    </div>
                )}
            </div>
        </Card>
    )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(protected-pages\)/concepts/avatar-forge/voice-studio/_components/ScriptEditor.tsx
git add src/app/\(protected-pages\)/concepts/avatar-forge/voice-studio/_components/AudioPreview.tsx
git add src/app/\(protected-pages\)/concepts/avatar-forge/voice-studio/_components/AudioMergePanel.tsx
git commit -m "feat: add ScriptEditor, AudioPreview, and AudioMergePanel components"
```

---

## Task 13: Navigation — Add Voice Studio link

**Files:**
- Modify: Navigation config or sidebar to include link to voice-studio

- [ ] **Step 1: Verify the Avatar Forge navigation structure**

Check `src/configs/navigation.config/` for where Avatar Forge sub-pages are listed. Look for entries like `avatar-list`, `avatar-studio`, `gallery`, etc.

Run: `grep -r "voice-studio\|avatar-forge\|avatar-studio" src/configs/ --include="*.ts" -l`

- [ ] **Step 2: Add voice-studio entry**

Add a navigation entry for Voice Studio alongside the existing Avatar Forge sub-items. The exact location depends on the navigation config structure found in step 1. The entry should be:

```typescript
{
    key: 'concepts.avatarForge.voiceStudio',
    path: '/concepts/avatar-forge/voice-studio',
    title: 'Voice Studio',
    translateKey: '',
    icon: 'voiceStudio',  // or relevant icon from the project's icon set
    type: NAV_ITEM_TYPE_ITEM,
    authority: [],
    subMenu: [],
}
```

- [ ] **Step 3: Commit**

```bash
git add src/configs/
git commit -m "feat: add Voice Studio to sidebar navigation"
```

---

## Task 14: Integration — Voice selector in Avatar Studio

**Files:**
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/GenerationControls.tsx`

- [ ] **Step 1: Add voice selector to GenerationControls**

Read `GenerationControls.tsx` to find the Kling voice controls section. Add a "Cloned Voice" option alongside the existing Kling voice controls. When a cloned voice is selected, store its `provider_voice_id` in the avatarStudioStore for use during generation.

The selector should:
1. Fetch voices from `/api/voice/list` on mount
2. Show a dropdown of available cloned voices
3. Include a "Go to Voice Studio" link if no voices exist
4. Store the selected voice_id in the generation params

- [ ] **Step 2: Commit**

```bash
git add src/app/\(protected-pages\)/concepts/avatar-forge/avatar-studio/_components/GenerationControls.tsx
git commit -m "feat: add cloned voice selector to Avatar Studio generation controls"
```

---

## Task 15: Manual E2E Verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: Server starts on port 3030

- [ ] **Step 2: Test voice cloning**

1. Navigate to `/concepts/avatar-forge/voice-studio`
2. Enter a voice name
3. Upload a 10s+ audio file (.mp3 or .wav)
4. Click "Clone Voice"
5. Expected: Voice appears in the library with status "ready"

- [ ] **Step 3: Test script generation**

1. Select template "UGC Ad", tone "Casual", language "Español", 30s
2. Click "Generate Script with AI"
3. Expected: Script text appears in the textarea, word count and estimated duration shown

- [ ] **Step 4: Test TTS**

1. Select the cloned voice from the library
2. With a script in the editor, click "Generate Audio"
3. Expected: Audio player appears with the generated speech using the cloned voice

- [ ] **Step 5: Test audio-video merge**

1. Paste a video URL from the gallery (a previously generated video from Supabase)
2. Click "Merge Audio + Video"
3. Expected: Merged video appears with the TTS audio track replacing the original

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: Voice & Script Studio — complete implementation with MiniMax TTS, Gemini scripts, FFmpeg merge"
```
