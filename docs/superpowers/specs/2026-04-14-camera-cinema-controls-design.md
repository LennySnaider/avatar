# Camera & Cinema Controls — Design Spec

## Context

Prime Avatar's image generation uses Gemini `gemini-3-pro-image-preview` with detailed prompt engineering. Currently, `cameraShot` and `cameraAngle` exist in the store with prompt-building logic (`buildCameraShotInstructions`) but are **not exposed in the UI**. The Quick Styles system covers lighting, mood, film styles, and color palettes — but has no cinema-specific controls for lens type, focal length, or aperture.

Inspired by Open-Generative-AI's Cinema Studio, we're adding lens, focal length, and aperture controls that translate into prompt modifiers, while simultaneously exposing the existing camera shot/angle controls.

## Design Decisions

- **Manual controls** visible in the UI (not presets)
- **Collapsible section** in GenerationControls, between Quick Styles and Clone Reference
- **Two-row layout**: Row 1 = CAMERA (existing shot/angle via selects), Row 2 = CINEMA (new lens/focal/aperture via pill toggles)
- **IMAGE mode only** (VIDEO mode uses Kling-specific camera controls)
- **Collapsed by default**

## Data Model

### New Types

```typescript
// In avatar-studio/types.ts

type CinemaLens =
  | 'AUTO'
  | 'ANAMORPHIC'
  | 'VINTAGE_PRIME'
  | 'MACRO'
  | 'TILT_SHIFT'
  | 'SWIRL_BOKEH'
  | 'SOFT_DIFFUSION'

type CinemaFocalLength = 'AUTO' | '24' | '35' | '50' | '85' | '135'

type CinemaAperture = 'AUTO' | '1.4' | '2.8' | '4' | '8' | '11'
```

### Lens Definitions

| ID | Label | Prompt Modifier |
|---|---|---|
| `AUTO` | Auto | *(none — let model decide)* |
| `ANAMORPHIC` | Anamorphic | "anamorphic lens, cinematic widescreen look, horizontal lens flares" |
| `VINTAGE_PRIME` | Vintage | "vintage prime lens, warm color rendering, soft organic falloff" |
| `MACRO` | Macro | "macro lens, extreme close-up detail, shallow plane of focus" |
| `TILT_SHIFT` | Tilt-Shift | "tilt-shift lens, selective focus plane, miniature effect" |
| `SWIRL_BOKEH` | Swirl Bokeh | "swirl bokeh lens, distinctive spiral background blur" |
| `SOFT_DIFFUSION` | Soft Focus | "soft diffusion filter, gentle halation glow, dreamy quality" |

### Focal Length Definitions

| Value | Prompt Modifier |
|---|---|
| `AUTO` | *(none)* |
| `24` | "24mm wide angle lens, expansive perspective, environmental context" |
| `35` | "35mm lens, natural field of view, slight wide angle" |
| `50` | "50mm standard lens, natural proportions, no perspective distortion" |
| `85` | "85mm portrait telephoto, compressed background, subject isolation" |
| `135` | "135mm tight telephoto, strong background compression, intimate framing" |

### Aperture Definitions

| Value | Prompt Modifier |
|---|---|
| `AUTO` | *(none)* |
| `1.4` | "f/1.4 aperture, shallow depth of field, creamy bokeh background" |
| `2.8` | "f/2.8 aperture, moderate bokeh, subject isolation with background context" |
| `4` | "f/4 aperture, balanced depth of field" |
| `8` | "f/8 aperture, deep focus, most of the scene is sharp" |
| `11` | "f/11 aperture, maximum depth of field, everything in focus from foreground to background" |

## Store Changes

New properties in `avatarStudioStore.ts`:

```typescript
// State
cinemaLens: CinemaLens          // default: 'AUTO'
cinemaFocalLength: CinemaFocalLength  // default: 'AUTO'
cinemaAperture: CinemaAperture  // default: 'AUTO'

// Actions
setCinemaLens: (lens: CinemaLens) => void
setCinemaFocalLength: (focal: CinemaFocalLength) => void
setCinemaAperture: (aperture: CinemaAperture) => void
```

## New Files

### `_constants/cinemaPresets.ts`

Contains the typed arrays with labels and prompt modifiers for lenses, focal lengths, and apertures. Follows the same pattern as `modelActionPresets.ts`.

### `_components/CinemaCameraControls.tsx`

Collapsible section component with two visual rows:

**Row 1 — CAMERA** (purple label):
- Framing: `<select>` with 9 camera shot options (EXTREME_CLOSE_UP through EXTREME_WIDE) + AUTO
- Angle: `<select>` with 9 angle options (LOW_ANGLE through THREE_QUARTER) + Auto (null)

These wire to existing `setCameraShot` and `setCameraAngle` in the store.

**Divider line**

**Row 2 — CINEMA** (purple label):
- Lens: Horizontal row of pill/chip toggles (7 options)
- Focal Length: 2-column grid, left side — compact pill buttons (`24`, `35`, `50`, `85`, `135`, `AUTO`)
- Aperture: 2-column grid, right side — compact pill buttons (`1.4`, `2.8`, `4`, `8`, `11`, `AUTO`)

**Prompt Preview** (bottom):
- Dark background box showing the combined text that will be injected into the prompt
- Updates live as user changes selections
- Only visible when at least one non-AUTO option is selected

## Prompt Integration

### New function: `buildCinemaInstructions()` in `GeminiService.ts`

```typescript
const buildCinemaInstructions = (): string => {
    // Reads cinemaLens, cinemaFocalLength, cinemaAperture from params
    // Combines non-AUTO modifiers into a structured text block
    // Returns empty string if all are AUTO
}
```

Output format when active:
```
CINEMA & LENS SPECIFICATIONS:
- Lens: [modifier text]
- Focal Length: [modifier text]
- Aperture/DoF: [modifier text]
Apply these camera/lens characteristics to the final image.
```

### Integration point in `generateAvatar()`

The cinema instructions are appended to the final prompt alongside `buildCameraShotInstructions()` and `buildStyleInstructions()`. Both camera shot (framing/angle) and cinema (lens/focal/aperture) are injected into the same prompt section.

Location: After the existing `buildCameraShotInstructions()` call (~line 1287 in GeminiService.ts).

### Parameter passing

`generateAvatar()` needs 3 new parameters: `cinemaLens`, `cinemaFocalLength`, `cinemaAperture`. These are passed from the component that calls `generateAvatar()` (AvatarStudioMain.tsx), read from the store.

## UI Behavior

- **Collapsed by default** — header shows "Camera & Cinema" with chevron
- **When expanded**: shows both rows
- **Active indicator**: when any non-AUTO option is selected, the collapse header shows a small indicator (e.g., dot or count)
- **IMAGE mode only**: hidden when `generationMode === 'VIDEO'`
- **Reset**: each subsection (CAMERA/CINEMA) has no dedicated reset — setting all options back to AUTO effectively resets

## Verification

1. Select lens "Anamorphic" + focal "85mm" + aperture "f/1.4" → verify prompt preview shows combined text
2. Generate an image with cinema controls → verify the `fullApiPrompt` includes lens/focal/aperture text
3. Set all controls to AUTO → verify no cinema text is injected
4. Switch to VIDEO mode → verify section is hidden
5. Select camera framing "Close Up" + angle "Low Angle" → verify existing `buildCameraShotInstructions` output includes both
6. Build passes without errors
