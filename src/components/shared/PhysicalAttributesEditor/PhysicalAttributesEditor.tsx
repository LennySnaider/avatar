'use client'

/**
 * Editor de Atributos Físicos COMPARTIDO (store-agnóstico) — fuente ÚNICA de la
 * UI de Body Type / medidas / Leg+Thighs / Curves (Bust·Glutes con slider
 * unificado cm↔nivel + shape chips + ref de región) / Skin Tone / Hair / Eye.
 *
 * Antes estaba COPY-PASTEADO en 3 sitios (avatar-studio/AvatarEditDrawer,
 * avatar-creator/AvatarCreatorMain, components/shared/AvatarEditDrawer) — el
 * shared drawer ya se había quedado atrás (inputs planos, sin Curves). Este
 * componente es `value + onChange` puro: cada host le pasa sus measurements y
 * (opcional) sus refs de región; sin acoplarse a ningún store.
 */

import { useRef, useState } from 'react'
import Slider from '@/components/ui/Slider'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Input from '@/components/ui/Input'
import Tooltip from '@/components/ui/Tooltip'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { HiOutlineX, HiOutlineUpload } from 'react-icons/hi'
import MeasurementSlider from '@/app/(protected-pages)/concepts/avatar-forge/_shared/MeasurementSlider'
import { createThumbnail } from '@/utils/imageOptimization'
import {
    LEG_TYPE_TOOLTIP,
    BUST_LEVEL_PHRASE,
    GLUTES_LEVEL_PHRASE,
    THIGHS_LEVEL_PHRASE,
    BUST_SHAPES,
    GLUTES_SHAPES,
    BUST_SHAPE_PHRASE,
    GLUTES_SHAPE_PHRASE,
    BUST_LEVEL_TO_CM,
    GLUTES_LEVEL_TO_CM,
    cmToBustLevel,
    cmToGlutesLevel,
    effectiveThighsLevel,
} from '@/utils/bodyDescriptors'
import { BODY_SHAPES, SHAPE_LABEL, SHAPE_PRESETS } from '@/utils/bodyShapes'
import type {
    PhysicalMeasurements,
    CurveLevel,
    BustShape,
    GlutesShape,
    BodyShape,
} from '@/@types/supabase'
import type { PhysicalRegionRef } from '@/components/shared/BodyLab'

// Forma mínima compartida de un ref de región (bust/glutes). Estructuralmente
// compatible con el ReferenceImage del Studio (que trae 'bust'|'glutes' en
// `type`); los hosts castean al setear si su tipo local es más estricto.
// Re-exportado desde BodyLab (mismo tipo) para no romper imports existentes.
export type { PhysicalRegionRef } from '@/components/shared/BodyLab'

// Etiquetas cortas para el slider de Build (1-5) — replican el sentido de
// BUILD_PHRASE en bodyDescriptors.ts sin importar ese const privado.
const BUILD_LEVEL_SHORT_LABEL: Record<number, string> = {
    1: '1 · lean',
    2: '2 · fit',
    3: '3 · balanced',
    4: '4 · curvy',
    5: '5 · full',
}

interface PhysicalAttributesEditorProps {
    measurements: PhysicalMeasurements
    onChange: (measurements: PhysicalMeasurements) => void
    // Refs de región (opcional). Si no se pasan los callbacks, el upload de
    // imagen junto a Bust/Glutes NO se muestra (p.ej. hosts sin refs de región).
    bustRef?: PhysicalRegionRef | null
    glutesRef?: PhysicalRegionRef | null
    onBustRef?: (ref: PhysicalRegionRef | null) => void
    onGlutesRef?: (ref: PhysicalRegionRef | null) => void
}

const PhysicalAttributesEditor = ({
    measurements,
    onChange,
    bustRef,
    glutesRef,
    onBustRef,
    onGlutesRef,
}: PhysicalAttributesEditorProps) => {
    const bustInputRef = useRef<HTMLInputElement>(null)
    const glutesInputRef = useRef<HTMLInputElement>(null)

    const set = (patch: Partial<PhysicalMeasurements>) =>
        onChange({ ...measurements, ...patch })

    // Forma → preset. Si ya hay una forma establecida, confirmar antes de
    // sobreescribir (con el ConfirmDialog de ECME — NUNCA window.confirm).
    const [pendingShape, setPendingShape] = useState<BodyShape | null>(null)
    const applyShape = (shape: BodyShape) =>
        onChange({ ...measurements, ...SHAPE_PRESETS[shape], shape })

    const processRegionFile = (file: File, region: 'bust' | 'glutes') => {
        if (
            !['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(
                file.type,
            )
        ) {
            toast.push(
                <Notification type="warning" title="Invalid File">
                    Please upload JPG, PNG, or WebP images
                </Notification>,
            )
            return
        }
        const reader = new FileReader()
        reader.onload = async (e) => {
            const result = e.target?.result as string
            const matches = result.match(/^data:(.+);base64,(.+)$/)
            if (!matches) return
            let thumbnailUrl = result
            try {
                thumbnailUrl = await createThumbnail(matches[2], 'THUMBNAIL')
            } catch {
                // Fallback to original
            }
            const ref: PhysicalRegionRef = {
                id: crypto.randomUUID(),
                url: result,
                mimeType: matches[1],
                base64: matches[2],
                type: region,
                thumbnailUrl,
            }
            if (region === 'bust') onBustRef?.(ref)
            else onGlutesRef?.(ref)
        }
        reader.readAsDataURL(file)
    }

    const handleRegionFileChange = (
        e: React.ChangeEvent<HTMLInputElement>,
        region: 'bust' | 'glutes',
    ) => {
        const files = e.target.files
        if (!files) return
        Array.from(files).forEach((file) => processRegionFile(file, region))
        e.target.value = ''
    }
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }
    const handleRegionDrop = (
        e: React.DragEvent,
        region: 'bust' | 'glutes',
    ) => {
        e.preventDefault()
        e.stopPropagation()
        const files = e.dataTransfer.files
        if (files)
            Array.from(files).forEach((f) => processRegionFile(f, region))
    }

    return (
        <div className="space-y-4">
            {/* Body Shape (preset) */}
            <div>
                <label className="text-xs text-gray-500 block mb-1">
                    Body Shape
                </label>
                <div className="flex flex-wrap gap-1">
                    {BODY_SHAPES.map((shape) => (
                        <button
                            key={shape}
                            onClick={() => {
                                // Si ya hay forma establecida, confirmar (ECME);
                                // en avatar nuevo se aplica directo.
                                if (measurements.shape) setPendingShape(shape)
                                else applyShape(shape)
                            }}
                            className={`px-2 py-1 text-xs rounded border transition-colors ${
                                measurements.shape === shape
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-primary'
                            }`}
                        >
                            {SHAPE_LABEL[shape]}
                        </button>
                    ))}
                </div>
            </div>

            {/* Measurements — slider dinámico + número al lado */}
            <div className="space-y-2">
                <MeasurementSlider
                    label="Age"
                    min={18}
                    max={65}
                    value={measurements.age}
                    onChange={(v) => set({ age: v })}
                />
                <MeasurementSlider
                    label="Height"
                    unit="cm"
                    min={140}
                    max={200}
                    value={measurements.height}
                    onChange={(v) => set({ height: v })}
                />
                <div>
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Build</span>
                        <span className="text-xs font-mono text-primary">
                            {measurements.build ?? 3}/5
                        </span>
                    </div>
                    <Slider
                        value={measurements.build ?? 3}
                        onChange={(val) =>
                            set({ build: val as number as CurveLevel })
                        }
                        min={1}
                        max={5}
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">
                        {BUILD_LEVEL_SHORT_LABEL[measurements.build ?? 3]}
                    </p>
                </div>
                <MeasurementSlider
                    label="Shoulders"
                    unit="cm"
                    min={70}
                    max={130}
                    value={measurements.shoulders ?? measurements.bust}
                    onChange={(v) => set({ shoulders: v })}
                />
                <MeasurementSlider
                    label="Waist"
                    unit="cm"
                    min={45}
                    max={100}
                    value={measurements.waist}
                    onChange={(v) => set({ waist: v })}
                />
                <MeasurementSlider
                    label="Hips"
                    unit="cm"
                    min={70}
                    max={140}
                    value={measurements.hips}
                    onChange={(v) => set({ hips: v })}
                />
                <div>
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                            Torso / legs
                        </span>
                        <span className="text-xs font-mono text-primary">
                            {measurements.torsoLegRatio
                                ? measurements.torsoLegRatio > 0
                                    ? `+${measurements.torsoLegRatio}`
                                    : measurements.torsoLegRatio
                                : '0'}
                        </span>
                    </div>
                    <Slider
                        value={measurements.torsoLegRatio ?? 0}
                        onChange={(val) =>
                            set({
                                torsoLegRatio:
                                    (val as number) === 0
                                        ? undefined
                                        : (val as number),
                            })
                        }
                        min={-2}
                        max={2}
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">
                        {measurements.torsoLegRatio &&
                        measurements.torsoLegRatio >= 1
                            ? 'long legs, elongated lower body'
                            : measurements.torsoLegRatio &&
                                measurements.torsoLegRatio <= -1
                              ? 'shorter legs, longer torso'
                              : 'neutral proportions'}
                    </p>
                </div>
            </div>

            {/* Leg Type */}
            <div>
                <label className="text-xs text-gray-500 block mb-1">
                    Leg Type
                </label>
                <div className="flex flex-wrap gap-1">
                    {(
                        [
                            undefined,
                            'slim',
                            'toned',
                            'athletic',
                            'muscular-thighs',
                            'long',
                            'curvy',
                            'thick',
                        ] as const
                    ).map((leg) => (
                        <Tooltip
                            key={leg ?? 'auto'}
                            title={LEG_TYPE_TOOLTIP[leg ?? 'auto']}
                        >
                            <button
                                onClick={() => set({ legType: leg })}
                                className={`px-2 py-1 text-xs rounded border transition-colors capitalize ${
                                    (measurements.legType ?? undefined) === leg
                                        ? 'bg-primary text-white border-primary'
                                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-primary'
                                }`}
                            >
                                {leg ?? 'auto'}
                            </button>
                        </Tooltip>
                    ))}
                </div>
                <div className="mt-2">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                            Thighs volume{' '}
                            <span className="text-[10px] text-amber-500">
                                (permissive models only)
                            </span>
                        </span>
                        <span className="text-xs font-mono text-primary">
                            {measurements.thighsLevel
                                ? `${measurements.thighsLevel}/5`
                                : 'Auto'}
                        </span>
                    </div>
                    <Slider
                        value={measurements.thighsLevel ?? 0}
                        onChange={(val) =>
                            set({
                                thighsLevel:
                                    (val as number) === 0
                                        ? undefined
                                        : (val as number as CurveLevel),
                            })
                        }
                        min={0}
                        max={5}
                    />
                    {measurements.thighsLevel ? (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                            {THIGHS_LEVEL_PHRASE[measurements.thighsLevel]}
                        </p>
                    ) : null}
                    {(effectiveThighsLevel(measurements) ?? 0) >
                    (measurements.thighsLevel ?? 0) ? (
                        <p className="text-[10px] text-amber-500 mt-0.5">
                            auto ≥{effectiveThighsLevel(measurements)}/5 para
                            hacer match con Glutes {measurements.glutesLevel}/5
                            (coherencia anatómica)
                        </p>
                    ) : null}
                </div>
            </div>

            {/* Curvas 1-5 — SOLO viajan a modelos con trait permissive (gating
                en el caller) */}
            <div>
                <label className="text-xs text-gray-500 block mb-2">
                    Curves{' '}
                    <span className="text-[10px] text-amber-500">
                        (permissive models only)
                    </span>
                </label>
                <div className="space-y-3">
                    {(
                        [
                            ['Bust', 'bustLevel', BUST_LEVEL_PHRASE],
                            ['Glutes', 'glutesLevel', GLUTES_LEVEL_PHRASE],
                        ] as const
                    ).map(([label, key, phrases]) => {
                        // Ref de REGIÓN fijo por avatar junto a su slider (la
                        // IMAGEN ancla mejor que el texto del slider).
                        const regionRef =
                            key === 'bustLevel' ? bustRef : glutesRef
                        const setRegionRef =
                            key === 'bustLevel' ? onBustRef : onGlutesRef
                        const regionInput =
                            key === 'bustLevel' ? bustInputRef : glutesInputRef
                        const regionName =
                            key === 'bustLevel' ? 'bust' : 'glutes'
                        // Control UNIFICADO: el slider 1-5 manda y escribe el cm
                        // mapeado; el input cm permite manual (deriva nivel).
                        const cmField = key === 'bustLevel' ? 'bust' : 'hips'
                        const cmValue =
                            key === 'bustLevel'
                                ? measurements.bust
                                : measurements.hips
                        const levelToCm =
                            key === 'bustLevel'
                                ? BUST_LEVEL_TO_CM
                                : GLUTES_LEVEL_TO_CM
                        const cmToLevel =
                            key === 'bustLevel'
                                ? cmToBustLevel
                                : cmToGlutesLevel
                        return (
                            <div key={key} className="flex items-start gap-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-500">
                                            {label}
                                        </span>
                                        <span className="text-xs font-mono text-primary">
                                            {measurements[key]
                                                ? `${measurements[key]}/5`
                                                : 'Auto'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 min-w-0">
                                            <Slider
                                                value={measurements[key] ?? 0}
                                                onChange={(val) => {
                                                    const lvl =
                                                        (val as number) === 0
                                                            ? undefined
                                                            : (val as number as CurveLevel)
                                                    // Solo Bust mapea a cm (m.bust).
                                                    // Glúteos = nivel/volumen puro;
                                                    // la cadera (m.hips) se controla
                                                    // con su propio slider arriba.
                                                    set({
                                                        [key]: lvl,
                                                        ...(lvl &&
                                                        key === 'bustLevel'
                                                            ? {
                                                                  [cmField]:
                                                                      levelToCm[
                                                                          lvl
                                                                      ],
                                                              }
                                                            : {}),
                                                    })
                                                }}
                                                min={0}
                                                max={5}
                                            />
                                        </div>
                                        {/* Solo Bust muestra cm (m.bust). Glúteos
                                            es nivel/volumen puro — la cadera
                                            (m.hips) tiene su slider propio arriba. */}
                                        {key === 'bustLevel' && (
                                            <div className="flex items-center gap-1 shrink-0">
                                                <Input
                                                    size="sm"
                                                    type="number"
                                                    className="w-16 text-right py-0.5 px-1.5"
                                                    value={cmValue}
                                                    onChange={(e) => {
                                                        const n = parseInt(
                                                            e.target.value,
                                                        )
                                                        if (!Number.isFinite(n))
                                                            return
                                                        set({
                                                            [cmField]: n,
                                                            [key]: cmToLevel(n),
                                                        })
                                                    }}
                                                />
                                                <span className="text-[10px] text-gray-400">
                                                    cm
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    {measurements[key] ? (
                                        <p className="text-[10px] text-gray-400 mt-0.5">
                                            {phrases[measurements[key]!]}
                                        </p>
                                    ) : null}
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                        {[
                                            undefined,
                                            ...(key === 'bustLevel'
                                                ? BUST_SHAPES
                                                : GLUTES_SHAPES),
                                        ].map((shape) => {
                                            const current =
                                                key === 'bustLevel'
                                                    ? measurements.bustShape
                                                    : measurements.glutesShape
                                            const phraseMap =
                                                key === 'bustLevel'
                                                    ? BUST_SHAPE_PHRASE
                                                    : GLUTES_SHAPE_PHRASE
                                            return (
                                                <Tooltip
                                                    key={shape ?? 'auto'}
                                                    title={
                                                        shape
                                                            ? phraseMap[shape]
                                                            : 'sin forma explícita — la decide el modelo'
                                                    }
                                                >
                                                    <button
                                                        onClick={() =>
                                                            set(
                                                                key ===
                                                                    'bustLevel'
                                                                    ? {
                                                                          bustShape:
                                                                              shape as
                                                                                  | BustShape
                                                                                  | undefined,
                                                                      }
                                                                    : {
                                                                          glutesShape:
                                                                              shape as
                                                                                  | GlutesShape
                                                                                  | undefined,
                                                                      },
                                                            )
                                                        }
                                                        className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors capitalize ${
                                                            (current ??
                                                                undefined) ===
                                                            shape
                                                                ? 'bg-primary text-white border-primary'
                                                                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-primary'
                                                        }`}
                                                    >
                                                        {shape ?? 'auto'}
                                                    </button>
                                                </Tooltip>
                                            )
                                        })}
                                    </div>
                                </div>
                                {setRegionRef && (
                                    <div className="shrink-0 pt-4">
                                        {regionRef ? (
                                            <div
                                                className="relative group"
                                                onDragOver={handleDragOver}
                                                onDrop={(e) =>
                                                    handleRegionDrop(
                                                        e,
                                                        regionName,
                                                    )
                                                }
                                            >
                                                <img
                                                    src={
                                                        regionRef.thumbnailUrl ||
                                                        regionRef.url
                                                    }
                                                    alt={`${label} ref`}
                                                    className="w-12 h-12 object-cover rounded-lg cursor-pointer"
                                                    onClick={() =>
                                                        regionInput?.current?.click()
                                                    }
                                                />
                                                <button
                                                    onClick={() =>
                                                        setRegionRef(null)
                                                    }
                                                    className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <HiOutlineX className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ) : (
                                            <Tooltip
                                                title={`${label} Ref — la imagen ancla la forma exacta (mejor que el slider); solo viaja a modelos permisivos`}
                                            >
                                                <button
                                                    onClick={() =>
                                                        regionInput?.current?.click()
                                                    }
                                                    onDragOver={handleDragOver}
                                                    onDrop={(e) =>
                                                        handleRegionDrop(
                                                            e,
                                                            regionName,
                                                        )
                                                    }
                                                    className="w-12 h-12 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary flex items-center justify-center text-gray-400 hover:text-primary transition-colors"
                                                >
                                                    <HiOutlineUpload className="w-4 h-4" />
                                                </button>
                                            </Tooltip>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                    <input
                        ref={bustInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleRegionFileChange(e, 'bust')}
                    />
                    <input
                        ref={glutesInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleRegionFileChange(e, 'glutes')}
                    />
                </div>
            </div>

            {/* Skin Tone / Hair / Eye se movieron a <AppearanceEditor> (se
                renderiza junto a las referencias de cara en el drawer). */}

            {/* Confirmación al sobreescribir medidas con un preset de forma (ECME) */}
            <ConfirmDialog
                isOpen={!!pendingShape}
                type="warning"
                title="Aplicar forma"
                confirmText="Aplicar"
                cancelText="Cancelar"
                onClose={() => setPendingShape(null)}
                onRequestClose={() => setPendingShape(null)}
                onCancel={() => setPendingShape(null)}
                onConfirm={() => {
                    if (pendingShape) applyShape(pendingShape)
                    setPendingShape(null)
                }}
            >
                <p>
                    Aplicar esta forma sobreescribe hombros, busto, cintura y
                    cadera con un ejemplo canónico. ¿Continuar?
                </p>
            </ConfirmDialog>
        </div>
    )
}

export default PhysicalAttributesEditor
