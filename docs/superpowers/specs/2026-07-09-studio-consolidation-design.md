# Studio Consolidation — Design (recovered plan)

**Date:** 2026-07-09
**Status:** Approved by user. Recovers a plan that lived only in a prior
conversation: move every tool into Avatar Studio. User chose **ToolModals
on demand** (over tabs) for the remaining tools.

## Already built (prior sessions)

- `ToolModal` — generic near-fullscreen Dialog hosting page-shaped tools
  (`avatar-studio/_components/ToolModal.tsx`).
- Flow Editor as a lazy StudioTabs tab (`StudioTabs.tsx`).
- Video Editor in-place: gallery/preview "Edit" on a VIDEO →
  `setVideoEditorMedia` → `<ToolModal><VideoEditorMain/></ToolModal>`
  (`AvatarStudioMain.tsx:167-170, 1981+`).

## Remaining scope (this spec)

Host **Voice Studio**, **Reel Remix** and **Reel Downloader** in ToolModals
opened from a new **Tools dropdown** in the studio header, then clean the
sidebar.

### 1. Tools dropdown (studio header)
In `AvatarStudioMain.tsx` header (next to the Prompts button): an ECME
`Dropdown` labeled "Tools" (wrench/grid icon) with items:
- 🎙 Voice Studio
- 🎞 Reel Remix
- ⬇️ Reel Downloader
Each sets `activeTool: 'voice' | 'remix' | 'downloader' | null` state.

### 2. ToolModal hosting
One `<ToolModal isOpen={activeTool === X}>` per tool (same pattern as the
video editor), content **lazily imported** with `next/dynamic`
(`{ ssr: false }`) so the studio bundle doesn't grow:
- `VoiceStudioMain` (from `../../voice-studio/_components/VoiceStudioMain`)
  needs `userId` + `avatars`. `userId` is already a prop of AvatarStudioMain.
  For `avatars`: read how the voice-studio page fetches them and reuse the
  same service call client-side (or an existing store source) — reconcile
  against the real `VoiceStudioMainProps`.
- `ReelRemixMain` and `ReelDownloaderMain` — read their pages' props first;
  pass what they need the same way.
If a hosted Main assumes URL/searchParams, adapt via optional props — do NOT
fork the components; they must keep working on their standalone routes.

### 3. Sidebar cleanup
Remove from `concepts.navigation.config.ts`: the entries for
`video-editor`, `voice-studio`, `reel-remix`, `reel-downloader` (and their
icons from navigation-icon.config if now unused; translations may stay).
The standalone ROUTES remain functional (deep links, sessionStorage handoffs
like `videoEditorImport` still work) — only nav entries disappear.
Sidebar after: Avatar Creator · Avatar Studio · Image Editor(?) · My Avatars
· Gallery · Social Media · Prompt Library · AI Providers. (Image Editor is
NOT in this scope — user listed video editor, voice, reel remix, "básicamente
todo"; keep Image Editor's entry unless it's already hosted in-studio — check
and note in the report, don't decide unilaterally.)

## Out of scope
- Converting tools to tabs (user chose modals).
- Refactoring the hosted Mains' internals.
- Image Editor migration (flagged for a follow-up decision).

## Verification
- tsc + eslint + `npm run build` clean.
- Manual: from the studio header open each tool → renders and works inside
  the modal (voice clone list loads, reel remix analyzes, downloader
  downloads); close → studio state intact; standalone routes still render
  when visited by URL; sidebar shows no entries for the four tools.
- The existing video-editor ToolModal flow (gallery Edit) keeps working.
