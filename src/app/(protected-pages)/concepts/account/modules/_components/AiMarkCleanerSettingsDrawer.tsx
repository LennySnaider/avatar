'use client'

import { useEffect, useRef, useState } from 'react'
import Notification from '@/components/ui/Notification'
import Drawer from '@/components/ui/Drawer'
import Switcher from '@/components/ui/Switcher'
import Tag from '@/components/ui/Tag'
import toast from '@/components/ui/toast'
import { AI_MARK_CLEAN_PRICE_TOKENS } from '@/lib/billing/catalog'
import type { AiMarkCleanerSettings } from '@/lib/aiMarks/settings'
import {
    getAiMarkCleanerStatus,
    updateAiMarkCleanerSettings,
    type AiMarkCleanerStatus,
} from '@/services/AiMarkCleanerService'

/**
 * Ajustes del módulo `ai-mark-cleaner` desde la tarjeta de Módulos.
 *
 * El estado se pide UNA VEZ POR APERTURA, no por render: un pestillo
 * (`pedidoRef`) evita que el doble montaje de React en desarrollo lo dispare
 * dos veces. Mismo patrón que el cajón del Estratega.
 */
function avisar(tipo: 'success' | 'danger', titulo: string, mensaje?: string) {
    toast.push(
        <Notification type={tipo} title={titulo}>
            {mensaje}
        </Notification>,
    )
}

interface FilaProps {
    titulo: string
    descripcion: string
    valor: boolean
    onChange: (v: boolean) => void
    deshabilitado?: boolean
    etiqueta?: string
}

function Fila({ titulo, descripcion, valor, onChange, deshabilitado, etiqueta }: FilaProps) {
    return (
        <div className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-semibold">{titulo}</span>
                    {etiqueta && <Tag className="bg-gray-100 dark:bg-gray-700">{etiqueta}</Tag>}
                </div>
                <p className="text-sm opacity-80 mt-1">{descripcion}</p>
            </div>
            <Switcher
                checked={valor}
                disabled={deshabilitado}
                onChange={(estado: boolean) => onChange(estado)}
            />
        </div>
    )
}

export default function AiMarkCleanerSettingsDrawer({
    isOpen,
    onClose,
}: {
    isOpen: boolean
    onClose: () => void
}) {
    const [estado, setEstado] = useState<AiMarkCleanerStatus | null>(null)
    const [cargando, setCargando] = useState(false)
    const [guardando, setGuardando] = useState(false)
    const pedidoRef = useRef(false)

    useEffect(() => {
        if (!isOpen) {
            pedidoRef.current = false
            return
        }
        if (pedidoRef.current) return
        pedidoRef.current = true
        setCargando(true)
        getAiMarkCleanerStatus()
            .then((r) => {
                if (r.success) setEstado(r.data)
                else avisar('danger', 'No se pudieron leer los ajustes', r.error)
            })
            .finally(() => setCargando(false))
    }, [isOpen])

    async function cambiar(parche: Partial<AiMarkCleanerSettings>) {
        if (!estado) return
        // Optimista: el interruptor responde al instante y se revierte si el
        // guardado falla. Un interruptor que tarda medio segundo en moverse
        // se siente roto.
        const previos = estado.ajustes
        setEstado({ ...estado, ajustes: { ...previos, ...parche } })
        setGuardando(true)
        const r = await updateAiMarkCleanerSettings(parche)
        setGuardando(false)
        if (r.success) {
            setEstado((actual) => (actual ? { ...actual, ajustes: r.data } : actual))
        } else {
            setEstado((actual) => (actual ? { ...actual, ajustes: previos } : actual))
            avisar('danger', 'No se pudo guardar', r.error)
        }
    }

    const ajustes = estado?.ajustes

    return (
        <Drawer
            title="Limpieza de marcas de IA"
            isOpen={isOpen}
            width={440}
            onClose={onClose}
            onRequestClose={onClose}
        >
            {cargando && <p className="opacity-70">Cargando…</p>}

            {!cargando && ajustes && (
                <div className="flex flex-col">
                    <p className="text-sm opacity-80 mb-2">
                        Elige qué se limpia automáticamente antes de guardarse. Sólo se
                        cobran tokens por los archivos en los que de verdad se quitó algo.
                    </p>

                    <div className="divide-y divide-gray-200 dark:divide-gray-600">
                        <Fila
                            titulo="Imágenes"
                            descripcion={`${AI_MARK_CLEAN_PRICE_TOKENS.imagen} tokens por imagen limpiada`}
                            valor={ajustes.images}
                            onChange={(v) => cambiar({ images: v })}
                            deshabilitado={guardando}
                        />
                        <Fila
                            titulo="Vídeos"
                            descripcion={`${AI_MARK_CLEAN_PRICE_TOKENS.videoSinRelleno} tokens, o ${AI_MARK_CLEAN_PRICE_TOKENS.videoConRelleno} si hay que borrar un logo fotograma a fotograma`}
                            valor={ajustes.videos}
                            onChange={(v) => cambiar({ videos: v })}
                            deshabilitado={guardando}
                        />
                        <Fila
                            titulo="Referencias de avatar"
                            descripcion="Las fotos de cara y las hojas de ángulos que subes. No se cobran."
                            valor={ajustes.references}
                            onChange={(v) => cambiar({ references: v })}
                            deshabilitado={guardando}
                        />
                        <Fila
                            titulo="Huella invisible (SynthID)"
                            etiqueta="Próximamente"
                            descripcion="La marca que Google mezcla en todos los píxeles. Quitarla obliga a repintar la imagen entera con otra IA, así que necesita una tarjeta gráfica y puede cambiar la cara del avatar."
                            valor={false}
                            deshabilitado
                            onChange={() => undefined}
                        />
                    </div>

                    {estado && (
                        <div className="mt-6 rounded-lg bg-gray-50 dark:bg-gray-700 p-4">
                            <p className="font-semibold mb-1">Este mes</p>
                            <p className="text-sm opacity-80">
                                {estado.usoDelMes.archivos} archivos limpiados ·{' '}
                                {estado.usoDelMes.tokens} tokens
                            </p>
                        </div>
                    )}

                    <p className="text-xs opacity-60 mt-4">
                        Quitar una marca no prueba que el archivo sea humano ni borra el
                        historial del proveedor. Úsalo con contenido propio.
                    </p>
                </div>
            )}
        </Drawer>
    )
}
