# Custom Hair Color — Design

**Date:** 2026-07-06
**Status:** Approved by user (brainstorming)

## Problem

The Hair Color picker in the avatar editors offers only 13 fixed natural
colors. Users want fashion colors (purple, pink, blue…) and arbitrary custom
shades. The block is duplicated across three components.

Key insight: `getHairColorDescription` (GeminiService.ts:66) already has a
fallback — `descriptions[hairColor] || hairColor.replace('-', ' ') + ' hair'`.
So any name flows to the prompt as `"<name> hair"` with no generation change.
The image prompt is text, so a NAME (not a hex code) is what works.

## Design

### Shared component
Extract `src/components/shared/HairColorPicker/HairColorPicker.tsx`
(with an `index.ts` re-export). Props:
```ts
interface HairColorPickerProps {
    value?: string
    onChange: (hairColor: string) => void
}
```
Renders:
1. Natural swatches (the existing 13).
2. Fashion swatches (named): purple, pink, blue, green, teal, lavender,
   rose-gold, burgundy.
3. A "Custom color" text input. Its value mirrors `value` when `value` is not
   a known swatch; typing calls `onChange(text)` (lowercased, trimmed).
4. `Selected: <value>` readout.

Selection highlight compares `value === swatch.value`; a free-text value
highlights no swatch (correct) and shows in the readout + input.

### Consumers (replace the inline block with `<HairColorPicker …/>`)
- `src/components/shared/AvatarEditDrawer/AvatarEditDrawer.tsx`
- `src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_components/AvatarEditDrawer.tsx`
- `src/app/(protected-pages)/concepts/avatar-forge/avatar-creator/_components/AvatarCreatorMain.tsx`

Each wires `value={localMeasurements.hairColor}` (creator: its store's
`measurements.hairColor`) and `onChange={(c) => setLocalMeasurements({ ...localMeasurements, hairColor: c })}`.

### Type
`src/@types/supabase.ts:292` — add the fashion values as named literals and
open to free text:
```ts
export type HairColor =
    | 'black' | 'dark-brown' | … | 'white'      // existing
    | 'purple' | 'pink' | 'blue' | 'green' | 'teal' | 'lavender' | 'rose-gold' | 'burgundy'
    | (string & {})                              // free-text custom, keeps literal autocomplete
```

### Generation
`getHairColorDescription` (GeminiService.ts:66) — add dictionary entries for
the fashion colors, e.g.:
- purple → `'vibrant purple hair, violet dyed hair'`
- pink → `'pink hair, rose pink dyed hair'`
- blue → `'blue hair, electric blue dyed hair'`
- green → `'green hair, emerald green dyed hair'`
- teal → `'teal hair, blue-green dyed hair'`
- lavender → `'lavender hair, pastel purple dyed hair'`
- rose-gold → `'rose gold hair, pinkish blonde dyed hair'`
- burgundy → `'burgundy hair, deep wine red dyed hair'`
Free text falls through to the existing fallback.

## Out of scope (YAGNI)
- Hex color picker / hex→name mapping.
- Language translation (input placeholder suggests English for the prompt).
- Touching Skin Tone.

## Verification
- `npx tsc --noEmit` clean; `eslint` clean on changed files.
- Manual: in each of the three editors — pick a fashion swatch (e.g. purple),
  confirm readout + persistence; type a custom color ("lavender"), confirm it
  saves; generate and confirm the prompt carries "<color> hair"
  (spot-check via the studio's prompt preview if available).
