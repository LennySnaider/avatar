# Camera & Cinema Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lens, focal length, and aperture controls to Avatar Studio's image generation, and expose the existing (but hidden) camera shot/angle controls — all in a collapsible "Camera & Cinema" section.

**Architecture:** New types and constants define cinema options with prompt modifiers. A new `CinemaCameraControls` component renders two rows (CAMERA selects + CINEMA pills). A `buildCinemaInstructions()` function in GeminiService converts selections into prompt text injected before the API call.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind CSS 4, Gemini API prompt engineering

**Spec:** `docs/superpowers/specs/2026-04-14-camera-cinema-controls-design.md`

---

### Task 1: Add Cinema Types and Constants

**Files:**
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/types.ts:92` (after CameraShot type)
- Create: `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_constants/cinemaPresets.ts`

- [ ] **Step 1: Add new types to `types.ts`**

Add after line 92 (after the `CameraShot` type definition):

```typescript
// Cinema lens types for image generation
export type CinemaLens =
    | 'AUTO'
    | 'ANAMORPHIC'
    | 'VINTAGE_PRIME'
    | 'MACRO'
    | 'TILT_SHIFT'
    | 'SWIRL_BOKEH'
    | 'SOFT_DIFFUSION'

// Focal length options (in mm)
export type CinemaFocalLength = 'AUTO' | '24' | '35' | '50' | '85' | '135'

// Aperture (f-stop) options
export type CinemaAperture = 'AUTO' | '1.4' | '2.8' | '4' | '8' | '11'
```

- [ ] **Step 2: Create `cinemaPresets.ts`**

```typescript
import type { CinemaLens, CinemaFocalLength, CinemaAperture } from '../types'

export interface CinemaPreset<T extends string> {
    value: T
    label: string
    promptModifier: string
}

export const CINEMA_LENSES: CinemaPreset<CinemaLens>[] = [
    { value: 'AUTO', label: 'Auto', promptModifier: '' },
    { value: 'ANAMORPHIC', label: 'Anamorphic', promptModifier: 'anamorphic lens, cinematic widescreen look, horizontal lens flares' },
    { value: 'VINTAGE_PRIME', label: 'Vintage', promptModifier: 'vintage prime lens, warm color rendering, soft organic falloff' },
    { value: 'MACRO', label: 'Macro', promptModifier: 'macro lens, extreme close-up detail, shallow plane of focus' },
    { value: 'TILT_SHIFT', label: 'Tilt-Shift', promptModifier: 'tilt-shift lens, selective focus plane, miniature effect' },
    { value: 'SWIRL_BOKEH', label: 'Swirl Bokeh', promptModifier: 'swirl bokeh lens, distinctive spiral background blur' },
    { value: 'SOFT_DIFFUSION', label: 'Soft Focus', promptModifier: 'soft diffusion filter, gentle halation glow, dreamy quality' },
]

export const CINEMA_FOCAL_LENGTHS: CinemaPreset<CinemaFocalLength>[] = [
    { value: 'AUTO', label: 'Auto', promptModifier: '' },
    { value: '24', label: '24mm', promptModifier: '24mm wide angle lens, expansive perspective, environmental context' },
    { value: '35', label: '35mm', promptModifier: '35mm lens, natural field of view, slight wide angle' },
    { value: '50', label: '50mm', promptModifier: '50mm standard lens, natural proportions, no perspective distortion' },
    { value: '85', label: '85mm', promptModifier: '85mm portrait telephoto, compressed background, subject isolation' },
    { value: '135', label: '135mm', promptModifier: '135mm tight telephoto, strong background compression, intimate framing' },
]

export const CINEMA_APERTURES: CinemaPreset<CinemaAperture>[] = [
    { value: 'AUTO', label: 'Auto', promptModifier: '' },
    { value: '1.4', label: 'f/1.4', promptModifier: 'f/1.4 aperture, shallow depth of field, creamy bokeh background' },
    { value: '2.8', label: 'f/2.8', promptModifier: 'f/2.8 aperture, moderate bokeh, subject isolation with background context' },
    { value: '4', label: 'f/4', promptModifier: 'f/4 aperture, balanced depth of field' },
    { value: '8', label: 'f/8', promptModifier: 'f/8 aperture, deep focus, most of the scene is sharp' },
    { value: '11', label: 'f/11', promptModifier: 'f/11 aperture, maximum depth of field, everything in focus from foreground to background' },
]

/**
 * Build a human-readable preview of the selected cinema settings.
 * Returns empty string if all settings are AUTO.
 */
export function buildCinemaPreview(
    lens: CinemaLens,
    focalLength: CinemaFocalLength,
    aperture: CinemaAperture,
): string {
    const parts: string[] = []

    const lensPreset = CINEMA_LENSES.find(l => l.value === lens)
    if (lensPreset && lensPreset.value !== 'AUTO') {
        parts.push(lensPreset.label + ' lens')
    }

    const focalPreset = CINEMA_FOCAL_LENGTHS.find(f => f.value === focalLength)
    if (focalPreset && focalPreset.value !== 'AUTO') {
        parts.push('at ' + focalPreset.label)
    }

    const aperturePreset = CINEMA_APERTURES.find(a => a.value === aperture)
    if (aperturePreset && aperturePreset.value !== 'AUTO') {
        parts.push(aperturePreset.label)
    }

    if (parts.length === 0) return ''
    return parts.join(', ')
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(protected-pages\)/concepts/avatar-forge/avatar-studio/types.ts \
       src/app/\(protected-pages\)/concepts/avatar-forge/avatar-studio/_constants/cinemaPresets.ts
git commit -m "feat: add cinema types and preset constants (lens, focal, aperture)"
```

---

### Task 2: Add Cinema State to Store

**Files:**
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_store/avatarStudioStore.ts:81` (after cameraAngle) and actions section

- [ ] **Step 1: Add cinema state properties**

After line 81 (`cameraAngle: CameraShot | null`) add:

```typescript
    // Cinema Controls
    cinemaLens: CinemaLens
    cinemaFocalLength: CinemaFocalLength
    cinemaAperture: CinemaAperture
```

- [ ] **Step 2: Add cinema action declarations**

After line 202 (`setCameraAngle`) add:

```typescript
    setCinemaLens: (lens: CinemaLens) => void
    setCinemaFocalLength: (focal: CinemaFocalLength) => void
    setCinemaAperture: (aperture: CinemaAperture) => void
```

- [ ] **Step 3: Add imports at the top of the store file**

Add `CinemaLens`, `CinemaFocalLength`, `CinemaAperture` to the type imports from `../types`.

- [ ] **Step 4: Add default values in the store's create function**

In the initial state object, add:

```typescript
    cinemaLens: 'AUTO',
    cinemaFocalLength: 'AUTO',
    cinemaAperture: 'AUTO',
```

- [ ] **Step 5: Add setter implementations**

In the actions section of the store:

```typescript
    setCinemaLens: (lens) => set({ cinemaLens: lens }),
    setCinemaFocalLength: (focal) => set({ cinemaFocalLength: focal }),
    setCinemaAperture: (aperture) => set({ cinemaAperture: aperture }),
```

- [ ] **Step 6: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds with no errors

- [ ] **Step 7: Commit**

```bash
git add src/app/\(protected-pages\)/concepts/avatar-forge/avatar-studio/_store/avatarStudioStore.ts
git commit -m "feat: add cinema lens/focal/aperture state to avatar studio store"
```

---

### Task 3: Create CinemaCameraControls Component

**Files:**
- Create: `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/CinemaCameraControls.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import { CAMERA_SHOTS } from '../types'
import type { CameraShot, CinemaLens, CinemaFocalLength, CinemaAperture } from '../types'
import {
    CINEMA_LENSES,
    CINEMA_FOCAL_LENGTHS,
    CINEMA_APERTURES,
    buildCinemaPreview,
} from '../_constants/cinemaPresets'
import { HiOutlineFilm, HiChevronDown, HiChevronUp } from 'react-icons/hi'

const CinemaCameraControls = () => {
    const [isExpanded, setIsExpanded] = useState(false)

    const {
        cameraShot,
        cameraAngle,
        cinemaLens,
        cinemaFocalLength,
        cinemaAperture,
        setCameraShot,
        setCameraAngle,
        setCinemaLens,
        setCinemaFocalLength,
        setCinemaAperture,
    } = useAvatarStudioStore()

    const framingOptions = CAMERA_SHOTS.filter(s => s.category === 'framing')
    const angleOptions = CAMERA_SHOTS.filter(s => s.category === 'angle')

    // Count active (non-AUTO/non-null) settings
    const activeCount = [
        cameraShot !== 'AUTO',
        cameraAngle !== null,
        cinemaLens !== 'AUTO',
        cinemaFocalLength !== 'AUTO',
        cinemaAperture !== 'AUTO',
    ].filter(Boolean).length

    const cinemaPreview = buildCinemaPreview(cinemaLens, cinemaFocalLength, cinemaAperture)

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {/* Collapse Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <HiOutlineFilm className="w-4 h-4 text-purple-500" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Camera & Cinema
                    </span>
                    {activeCount > 0 && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-500/20 text-purple-400 rounded-full">
                            {activeCount}
                        </span>
                    )}
                </div>
                {isExpanded ? (
                    <HiChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                    <HiChevronDown className="w-4 h-4 text-gray-400" />
                )}
            </button>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="px-3 py-3 space-y-3">
                    {/* Row 1: CAMERA */}
                    <div>
                        <div className="text-[10px] font-semibold text-purple-500 uppercase tracking-wider mb-2">
                            Camera
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[10px] text-gray-500 mb-1 block">Framing</label>
                                <select
                                    value={cameraShot}
                                    onChange={(e) => setCameraShot(e.target.value as CameraShot)}
                                    className="w-full px-2 py-1.5 border rounded-lg text-xs bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                                >
                                    {framingOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] text-gray-500 mb-1 block">Angle</label>
                                <select
                                    value={cameraAngle ?? ''}
                                    onChange={(e) =>
                                        setCameraAngle(
                                            e.target.value === '' ? null : (e.target.value as CameraShot)
                                        )
                                    }
                                    className="w-full px-2 py-1.5 border rounded-lg text-xs bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                                >
                                    <option value="">Auto</option>
                                    {angleOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-gray-200 dark:border-gray-700" />

                    {/* Row 2: CINEMA */}
                    <div className="space-y-2">
                        <div className="text-[10px] font-semibold text-purple-500 uppercase tracking-wider">
                            Cinema
                        </div>

                        {/* Lens Pills */}
                        <div>
                            <label className="text-[10px] text-gray-500 mb-1 block">Lens</label>
                            <div className="flex gap-1 flex-wrap">
                                {CINEMA_LENSES.map((lens) => (
                                    <button
                                        key={lens.value}
                                        onClick={() => setCinemaLens(lens.value)}
                                        className={`px-2 py-1 rounded-full text-[11px] border transition-colors ${
                                            cinemaLens === lens.value
                                                ? 'border-purple-500 text-purple-400 bg-purple-500/10'
                                                : 'border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-400 dark:hover:border-gray-500'
                                        }`}
                                    >
                                        {lens.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Focal Length + Aperture in 2-col grid */}
                        <div className="grid grid-cols-2 gap-2">
                            {/* Focal Length */}
                            <div>
                                <label className="text-[10px] text-gray-500 mb-1 block">Focal Length</label>
                                <div className="flex gap-1">
                                    {CINEMA_FOCAL_LENGTHS.map((focal) => (
                                        <button
                                            key={focal.value}
                                            onClick={() => setCinemaFocalLength(focal.value)}
                                            className={`flex-1 py-1 rounded text-[10px] border text-center transition-colors ${
                                                cinemaFocalLength === focal.value
                                                    ? 'border-purple-500 text-purple-400 bg-purple-500/10'
                                                    : 'border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-400 dark:hover:border-gray-500'
                                            }`}
                                        >
                                            {focal.value === 'AUTO' ? 'Auto' : focal.value}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Aperture */}
                            <div>
                                <label className="text-[10px] text-gray-500 mb-1 block">Aperture</label>
                                <div className="flex gap-1">
                                    {CINEMA_APERTURES.map((ap) => (
                                        <button
                                            key={ap.value}
                                            onClick={() => setCinemaAperture(ap.value)}
                                            className={`flex-1 py-1 rounded text-[10px] border text-center transition-colors ${
                                                cinemaAperture === ap.value
                                                    ? 'border-purple-500 text-purple-400 bg-purple-500/10'
                                                    : 'border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-400 dark:hover:border-gray-500'
                                            }`}
                                        >
                                            {ap.value === 'AUTO' ? 'Auto' : ap.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Prompt Preview */}
                    {cinemaPreview && (
                        <div className="px-2 py-1.5 bg-gray-900/50 rounded text-[11px] text-gray-500 italic">
                            {cinemaPreview}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default CinemaCameraControls
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/\(protected-pages\)/concepts/avatar-forge/avatar-studio/_components/CinemaCameraControls.tsx
git commit -m "feat: create CinemaCameraControls collapsible component"
```

---

### Task 4: Wire Component into GenerationControls

**Files:**
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/GenerationControls.tsx`

- [ ] **Step 1: Add import**

After line 37 (`import KlingMotionControlEditor from './KlingMotionControlEditor'`), add:

```typescript
import CinemaCameraControls from './CinemaCameraControls'
```

- [ ] **Step 2: Add component to JSX**

Add the `CinemaCameraControls` between the Quick Styles Dropdown (ends ~line 583) and the Aspect Ratio section (starts ~line 586). Insert after line 584 (`</div>`):

```tsx
            {/* Camera & Cinema Controls (IMAGE mode only) */}
            {generationMode === 'IMAGE' && <CinemaCameraControls />}
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/app/\(protected-pages\)/concepts/avatar-forge/avatar-studio/_components/GenerationControls.tsx
git commit -m "feat: add CinemaCameraControls to GenerationControls (IMAGE mode)"
```

---

### Task 5: Add `buildCinemaInstructions` to GeminiService and Wire to Prompt

**Files:**
- Modify: `src/services/GeminiService.ts:731` (generateAvatar params) and ~line 1181 (after buildCameraShotInstructions)

- [ ] **Step 1: Import cinema types**

Add to the import from `../types` or add a direct import at top of GeminiService.ts:

```typescript
import type { CinemaLens, CinemaFocalLength, CinemaAperture } from '@/app/(protected-pages)/concepts/avatar-forge/avatar-studio/types'
import { CINEMA_LENSES, CINEMA_FOCAL_LENGTHS, CINEMA_APERTURES } from '@/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_constants/cinemaPresets'
```

- [ ] **Step 2: Add cinema params to `generateAvatar` function signature**

After line 742 (`cameraAngle?: CameraShot | null`), add:

```typescript
    cinemaLens?: CinemaLens
    cinemaFocalLength?: CinemaFocalLength
    cinemaAperture?: CinemaAperture
```

- [ ] **Step 3: Destructure new params**

In the destructuring block inside `generateAvatar` (after `cameraAngle`), add:

```typescript
        cinemaLens = 'AUTO',
        cinemaFocalLength = 'AUTO',
        cinemaAperture = 'AUTO',
```

- [ ] **Step 4: Add `buildCinemaInstructions` function**

After `buildCameraShotInstructions` function (after line 1181), add:

```typescript
    // Build cinema lens/focal/aperture instructions
    const buildCinemaInstructions = (): string => {
        const lensModifier = CINEMA_LENSES.find(l => l.value === cinemaLens)?.promptModifier || ''
        const focalModifier = CINEMA_FOCAL_LENGTHS.find(f => f.value === cinemaFocalLength)?.promptModifier || ''
        const apertureModifier = CINEMA_APERTURES.find(a => a.value === cinemaAperture)?.promptModifier || ''

        const parts = [lensModifier, focalModifier, apertureModifier].filter(Boolean)
        if (parts.length === 0) return ''

        return `
    ═══════════════════════════════════════════════════════════════
    CINEMA & LENS SPECIFICATIONS:
    ═══════════════════════════════════════════════════════════════
    ${parts.map(p => `- ${p}`).join('\n    ')}

    Apply these camera/lens characteristics to the final image.
    `
    }
```

- [ ] **Step 5: Inject cinema instructions into `finalPrompt`**

In the `finalPrompt` template string (~line 1287), find `${buildCameraShotInstructions()}` and add cinema instructions after it:

```typescript
    ${buildCameraShotInstructions()}
    ${buildCinemaInstructions()}
    ${buildStyleInstructions()}
```

- [ ] **Step 6: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/services/GeminiService.ts
git commit -m "feat: add buildCinemaInstructions and wire to generateAvatar prompt"
```

---

### Task 6: Pass Cinema Params from AvatarStudioMain

**Files:**
- Modify: `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/AvatarStudioMain.tsx`

- [ ] **Step 1: Destructure cinema state from store**

In the store destructuring (~line 70, near `cameraShot`), add:

```typescript
        cinemaLens,
        cinemaFocalLength,
        cinemaAperture,
```

- [ ] **Step 2: Pass cinema params to `generateAvatar()` call**

In the `generateAvatar()` call (~line 396), after `cameraAngle,` add:

```typescript
                    cinemaLens,
                    cinemaFocalLength,
                    cinemaAperture,
```

- [ ] **Step 3: Add to dependency array**

In the `useCallback` dependency array that contains `cameraShot, cameraAngle` (~line 589), add:

```typescript
        cinemaLens,
        cinemaFocalLength,
        cinemaAperture,
```

- [ ] **Step 4: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds with no errors

- [ ] **Step 5: Commit**

```bash
git add src/app/\(protected-pages\)/concepts/avatar-forge/avatar-studio/_components/AvatarStudioMain.tsx
git commit -m "feat: pass cinema params from AvatarStudioMain to generateAvatar"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Full build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds with no errors and no TypeScript errors

- [ ] **Step 2: Lint check**

Run: `npm run lint 2>&1 | tail -10`
Expected: No new lint errors

- [ ] **Step 3: Manual verification checklist**

Verify in the running app (`npm run dev`):
1. IMAGE mode shows "Camera & Cinema" collapsible section between Quick Styles and Aspect Ratio
2. VIDEO mode hides the section
3. Clicking the section expands to show CAMERA (selects) and CINEMA (pills) rows
4. Selecting a lens/focal/aperture shows the purple active state on pills
5. Active count badge appears on the collapse header
6. Prompt preview text appears when any non-AUTO cinema option is selected
7. Generate an image with cinema controls → check `fullApiPrompt` in console includes cinema instructions

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address any issues found during verification"
```
