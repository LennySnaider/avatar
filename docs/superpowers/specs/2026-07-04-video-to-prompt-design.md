# Video-to-Prompt ("From Video") — Design

**Date:** 2026-07-04
**Status:** Approved by user (brainstorming session)

## Problem

Kling 3.0 motion-control (KIE) rejects most social-media reference videos: its
person detector requires head + shoulders + torso fully visible, no occlusion,
no text overlays. Selfie/close-up reels fail with `422 No complete upper body`
or `400 No valid characters detected`. It also bills ~20 credits/second of
driving video.

Instead of driving motion with the video, analyze it with a vision model and
produce a **detailed cinematic prompt** that imitates the video (action beats,
camera work, scene, mood). The user then generates a normal i2v clip with
their avatar image on any provider — no person detector, no per-second
motion-control pricing.

## User flow

1. A **"From video"** button sits next to the main prompt textarea (same
   pattern as ContinueVideoDialog's "Generate with AI").
2. Click opens **`VideoToPromptDialog`** with two sources:
   - **Upload**: file → Supabase Storage via the existing signed-URL flow
     (`createMotionVideoUploadUrl` + `uploadToSignedUrl`) — bypasses Vercel's
     4.5MB request cap. Only the public URL travels to the server.
   - **URL**: paste a direct video URL (.mp4 etc.).
   Video preview (`<video>` tag) + duration read from element metadata.
3. **"Analyze video"** → new server action `analyzeVideoForPrompt(videoUrl)`
   in `GeminiService.ts`.
4. Dialog shows the generated prompt in an **editable textarea** + suggested
   duration (display-only hint; it does not change the duration selector).
   **"Use prompt"** writes it to the store (`setPrompt`) and closes.
5. User generates as usual (ANIMATE i2v with their avatar image, any
   provider). Motion Control remains available and untouched.

## Server action: `analyzeVideoForPrompt`

- Input: `{ videoUrl: string }`.
- Fetches the video server-side (no client body limits). Rejects > 20MB
  (Gemini inline limit) with a clear message.
- Calls Gemini (`gemini-2.5-flash`, existing `@google/genai` pattern) with the
  video as `inlineData` and a fixed instruction:
  - Describe, beat by beat: subject action and gestures, timing/pacing.
  - Camera: framing, movement (push-in, handheld, orbit, pan…), lens feel.
  - Scene: environment, lighting, mood, color grade.
  - **Forbidden**: any physical description of the person (face, body, hair,
    clothing, identity) — the avatar's `[BODY]`/`[FACE]` harness owns that.
  - Output: ONE cinematic i2v prompt in English, ~100–200 words, plus a
    suggested duration in seconds.
- Returns **error-as-data** (`{ success, prompt?, suggestedDurationSeconds?,
  error? }`) — same pattern as `generateMotionControlKieSafe` — so real causes
  surface in the client instead of masked 500s.

## Components

| Unit | Responsibility |
|---|---|
| `VideoToPromptDialog.tsx` (new) | Source tabs (Upload/URL), preview, analyze button, editable result, "Use prompt". |
| `BottomControlBar.tsx` | Render the "From video" trigger button next to the prompt textarea; pass `setPrompt`. |
| `GeminiService.ts` | `analyzeVideoForPrompt` server action (fetch video → Gemini → prompt). |
| Reused | `createMotionVideoUploadUrl` (KieService), `supabase.storage.uploadToSignedUrl`, Dialog/Button/Input UI kit, store `setPrompt`. |

## Errors

- Unreachable/non-video URL → "Could not fetch video from URL".
- Video > 20MB → "Video too large to analyze (max 20MB) — trim or compress".
- Gemini failure → surface its message. All as data in the dialog, no throws
  across the server-action boundary.

## Out of scope (YAGNI)

- Auto-generating the video after analysis (user reviews/edits first).
- Files API for > 20MB videos.
- Changes to Motion Control or its pricing/validation.
- Frame-sampling fallback.

## Verification

1. `npx tsc --noEmit` clean.
2. Manual E2E (dev, port 3001): upload a selfie-style reel that motion-control
   rejects → analyze → prompt appears, contains action/camera/scene, contains
   NO physical description of the reference person → "Use prompt" fills the
   main textarea → generate i2v with Kling 3.0 · KIE and confirm a clip is
   produced.
3. URL tab with a direct .mp4 link.
4. Oversized video (>20MB) shows the friendly error.
