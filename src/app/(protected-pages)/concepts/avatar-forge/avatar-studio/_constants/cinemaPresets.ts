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
