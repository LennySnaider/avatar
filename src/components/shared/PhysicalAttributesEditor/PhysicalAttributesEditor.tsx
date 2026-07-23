'use client'

/**
 * Editor de Atributos Físicos COMPARTIDO (store-agnóstico) — fuente ÚNICA de la
 * UI de Body Type / medidas / Leg+Thighs / Curves (Bust·Glutes con slider
 * unificado cm↔nivel + shape chips) / Skin Tone / Hair / Eye.
 *
 * Antes estaba COPY-PASTEADO en 3 sitios (avatar-studio/AvatarEditDrawer,
 * avatar-creator/AvatarCreatorMain, components/shared/AvatarEditDrawer) — el
 * shared drawer ya se había quedado atrás (inputs planos, sin Curves). Este
 * componente es `value + onChange` puro: cada host le pasa sus measurements;
 * sin acoplarse a ningún store.
 *
 * NOTA: el ref de imagen por región (bust/glutes) que vivía junto a estos
 * sliders se retiró — quedó obsoleto frente al body ref canónico de Body Lab
 * y dejaba refs fantasma sin UI para verlos/quitarlos en avatares viejos.
 */

import { useState } from 'react'
import Slider from '@/components/ui/Slider'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Input from '@/components/ui/Input'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Tooltip from '@/components/ui/Tooltip'
import MeasurementSlider from '@/app/(protected-pages)/concepts/avatar-forge/_shared/MeasurementSlider'
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
    describeBody,
    buildCurvesEmphasis,
} from '@/utils/bodyDescriptors'
import { BODY_SHAPES, SHAPE_LABEL, SHAPE_PRESETS } from '@/utils/bodyShapes'
import type {
    PhysicalMeasurements,
    CurveLevel,
    BustShape,
    GlutesShape,
    BodyShape,
} from '@/@types/supabase'

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
}

const PhysicalAttributesEditor = ({
    measurements,
    onChange,
}: PhysicalAttributesEditorProps) => {
    const set = (patch: Partial<PhysicalMeasurements>) =>
        onChange({ ...measurements, ...patch })

    // Forma → preset. Si ya hay una forma establecida, confirmar antes de
    // sobreescribir (con el ConfirmDialog de ECME — NUNCA window.confirm).
    const [pendingShape, setPendingShape] = useState<BodyShape | null>(null)

    // Prompt del físico (inspección/calibración): el MISMO material que viaja
    // al modelo — silueta por ratio + frases de curvas (incl. candado XXL) +
    // cm exactos. Editable para retocar y copiar.
    const [physiquePrompt, setPhysiquePrompt] = useState('')
    const buildPhysiquePrompt = () => {
        const m = measurements
        const cm =
            m.bust && m.waist && m.hips
                ? `bust ${m.bust}cm, waist ${m.waist}cm, hips ${m.hips}cm${
                      m.shoulders ? `, shoulders ${m.shoulders}cm` : ''
                  }${
                      m.waist && m.hips
                          ? ` — hip-to-waist ratio ${(m.hips / m.waist).toFixed(2)}`
                          : ''
                  }`
                : ''
        return [describeBody(m), buildCurvesEmphasis(m), cm]
            .filter(Boolean)
            .join('. ')
    }
    const applyShape = (shape: BodyShape) =>
        onChange({ ...measurements, ...SHAPE_PRESETS[shape], shape })

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
                                ? `${measurements.thighsLevel}/6`
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
                        max={6}
                    />
                    {measurements.thighsLevel ? (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                            {THIGHS_LEVEL_PHRASE[measurements.thighsLevel]}
                        </p>
                    ) : null}
                    {(effectiveThighsLevel(measurements) ?? 0) >
                    (measurements.thighsLevel ?? 0) ? (
                        <p className="text-[10px] text-amber-500 mt-0.5">
                            auto ≥{effectiveThighsLevel(measurements)}/6 para
                            hacer match con Glutes {measurements.glutesLevel}/6
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
                                                ? `${measurements[key]}/6`
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
                                                max={6}
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
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Skin Tone / Hair / Eye se movieron a <AppearanceEditor> (se
                renderiza junto a las referencias de cara en el drawer). */}

            {/* Prompt del físico — inspección/edición del texto que estos
                sliders producen (describeBody + curvas + cm), con copy/paste.
                Herramienta de calibración pedida por el usuario (2026-07-23). */}
            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-500">
                        Prompt del físico
                    </label>
                    <div className="flex items-center gap-1">
                        <Button
                            size="xs"
                            variant="plain"
                            onClick={() =>
                                setPhysiquePrompt(buildPhysiquePrompt())
                            }
                        >
                            Generar prompt
                        </Button>
                        <Button
                            size="xs"
                            variant="plain"
                            disabled={!physiquePrompt.trim()}
                            onClick={async () => {
                                try {
                                    await navigator.clipboard.writeText(
                                        physiquePrompt,
                                    )
                                    toast.push(
                                        <Notification
                                            type="success"
                                            title="Copiado"
                                            duration={2000}
                                        >
                                            Prompt del físico en el
                                            portapapeles.
                                        </Notification>,
                                    )
                                } catch {
                                    toast.push(
                                        <Notification
                                            type="warning"
                                            title="Copiar"
                                        >
                                            No se pudo acceder al portapapeles.
                                        </Notification>,
                                    )
                                }
                            }}
                        >
                            Copy
                        </Button>
                        <Button
                            size="xs"
                            variant="plain"
                            onClick={async () => {
                                try {
                                    const text =
                                        await navigator.clipboard.readText()
                                    if (text.trim()) setPhysiquePrompt(text)
                                } catch {
                                    toast.push(
                                        <Notification
                                            type="warning"
                                            title="Pegar"
                                        >
                                            No se pudo leer el portapapeles —
                                            pega manualmente (⌘V) en el campo.
                                        </Notification>,
                                    )
                                }
                            }}
                        >
                            Paste
                        </Button>
                    </div>
                </div>
                <Input
                    textArea
                    rows={5}
                    placeholder="Pulsa «Generar prompt» para ver el texto físico que producen estos sliders…"
                    value={physiquePrompt}
                    onChange={(e) => setPhysiquePrompt(e.target.value)}
                    className="text-xs font-mono"
                />
            </div>

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
