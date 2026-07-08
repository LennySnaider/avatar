# Eye Color Selector — Design

**Date:** 2026-07-07
**Status:** Approved by user (brainstorming)

## Problem

Avatars have hair color, skin tone, and body measurements, but no eye color
control. Users want to pick eye color (natural + fashion/contacts + custom),
exactly like the hair-color picker shipped earlier. `eyeColor` does not exist
in the data model yet.

## Design

### Generalize the picker (DRY)
Extract `src/components/shared/ColorSwatchPicker/ColorSwatchPicker.tsx` from the
current `HairColorPicker`. Props:
```ts
interface ColorSwatchPickerProps {
    label: string
    value?: string
    onChange: (value: string) => void
    naturalColors: readonly { value: string; color: string; label: string }[]
    fashionColors: readonly { value: string; color: string; label: string }[]
    customPlaceholder: string
    fallbackLabel: string // shown in "Selected:" when value is empty
}
```
Rewrite `HairColorPicker` as a thin wrapper passing the hair palette, and add
`EyeColorPicker` as a wrapper passing the eye palette. Behavior identical to
today's hair picker (natural row, fashion row, free-text input, Selected: line).

### Model
`src/@types/supabase.ts` — add `eyeColor?: EyeColor` to `PhysicalMeasurements`
and a new type:
```ts
export type EyeColor =
    | 'dark-brown' | 'brown' | 'amber' | 'hazel' | 'green' | 'blue' | 'light-blue' | 'gray'
    | 'violet' | 'aqua' | 'red'            // fashion / colored contacts
    | (string & {})                         // free text
```

### Palette
- Natural: dark brown `#3b2314`, brown `#6b4423`, amber `#b8732e`, hazel `#8e7618`,
  green `#557a46`, blue `#4a7fa5`, light blue `#a7cfe0`, gray `#8b959e`.
- Fashion: violet `#8b5fbf`, aqua `#3fbfbf`, red `#a83232`.

### Descriptor
`src/utils/bodyDescriptors.ts` — add `getEyeColorDescription(eyeColor?): string`:
- brown → `'warm brown eyes'`, amber → `'amber golden-brown eyes'`,
  hazel → `'hazel eyes, green-brown blend'`, green → `'green eyes'`,
  blue → `'blue eyes'`, light-blue → `'light ice-blue eyes'`, gray → `'gray eyes'`,
  dark-brown → `'dark brown eyes'`, violet → `'violet colored contact-lens eyes'`,
  aqua → `'aqua turquoise colored eyes'`, red → `'red colored contact-lens eyes'`.
- Free text → `'<name> eyes'` fallback.

### Generation (both paths — GeminiService.generateAvatar + avatarPromptBuilder.buildAvatarPrompt)
The stored `face_description` always states an eye color ("green almond eyes"),
so the same image-beats-text conflict as hair applies. Add an **EYE COLOR
OVERRIDE** block, injected last (highest priority), whenever `eyeColor` is set:
> The iris color MUST be `<eyeColorDesc>`, overriding any eye color in the
> references or description. Recolor ONLY the iris; keep eye shape and the
> exact face identity.

Also fold the eye color into the inline body description (weak mention) next to
hair color, for reinforcement. Annotate the face_description ("ignore any eye
color") the same way hair does.

### UI
Add `<EyeColorPicker value={m.eyeColor} onChange=…/>` directly below Hair Color
in all three editors: shared `AvatarEditDrawer`, avatar-studio `AvatarEditDrawer`,
avatar-creator `AvatarCreatorMain`.

## Out of scope (YAGNI)
- Heterochromia (two different eye colors).
- Hex color picker.

## Verification
- `npx tsc --noEmit` clean; `eslint` clean on changed files.
- Run the real `buildAvatarPrompt` with `eyeColor: 'blue'` + a face description
  saying "green eyes": assert the finalPrompt contains EYE COLOR OVERRIDE and
  "blue eyes", and the face_description eye-color annotation is present.
- Manual: pick an eye color (natural + fashion + custom) in each editor,
  confirm it persists; generate and confirm the iris color changes.
