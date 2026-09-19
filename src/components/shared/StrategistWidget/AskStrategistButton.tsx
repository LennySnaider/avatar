'use client'

import { HiOutlineSparkles } from 'react-icons/hi'
import Button from '@/components/ui/Button'
import { useStrategistStore } from './useStrategistStore'
import type { AssistantScreen } from '@/lib/assistant/types'

/**
 * F5.2 (Estratega) Task 5 — El atajo que hay en las pantallas: abre EL MISMO
 * cajón del widget con una pregunta ya escrita.
 *
 * NO ENVÍA LA PREGUNTA, la deja en el área de texto. Un turno cuesta tokens de
 * la organización, así que el disparador tiene que ser siempre un acto
 * deliberado: el botón acerca la pregunta, la persona decide si la manda tal
 * cual, la retoca o cierra el panel.
 *
 * NO SE PINTA SI NO HAY WIDGET (módulo sin instalar, o layout que todavía no
 * lo ha montado): un botón que abriría un cajón inexistente es una promesa
 * rota. La bandera la iza el propio widget al montarse, así que esto no cuesta
 * ni una llamada al servidor desde cada tarjeta.
 */
const AskStrategistButton = ({
    prompt,
    screen,
    label = 'Ask the Strategist',
    className,
}: {
    prompt: string
    screen: AssistantScreen
    label?: string
    className?: string
}) => {
    const mounted = useStrategistStore((s) => s.mounted)
    const open = useStrategistStore((s) => s.open)

    if (!mounted) return null

    return (
        <Button
            size="xs"
            variant="plain"
            className={className}
            icon={<HiOutlineSparkles />}
            onClick={() => open({ prompt, screen })}
        >
            {label}
        </Button>
    )
}

export default AskStrategistButton
