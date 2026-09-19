import { create } from 'zustand'
import type { AssistantScreen } from '@/lib/assistant/types'

/**
 * F5.2 (Estratega) Task 5 — El estado COMPARTIDO del widget flotante.
 *
 * Vive en un store global y no en el propio widget porque hay dos clases de
 * mandos que lo tocan y no se conocen entre sí:
 *   - el FAB y el cajón (el widget, montado una vez en el layout protegido);
 *   - los botones contextuales de Social Accounts, Social Posts e Inbox, que
 *     están a varios niveles de distancia en el árbol y sólo quieren decir
 *     "abre el cajón con esta pregunta escrita".
 * Pasar un callback desde el layout hasta cada tarjeta sería atravesar media
 * aplicación con props que no usa nadie por el camino.
 *
 * `mounted` ES LA CONDICIÓN DE LOS BOTONES CONTEXTUALES. El módulo puede no
 * estar instalado, y entonces el widget devuelve `null` y no hay cajón que
 * abrir: un botón "Ask the Strategist" que no hace nada es peor que no tener
 * botón. En vez de volver a preguntar al servidor desde cada pantalla (una
 * lectura de `org_modules` por tarjeta), el widget IZA esta bandera al
 * montarse y los botones la leen. Coste: cero llamadas; precio: los botones
 * aparecen en el mismo render en que el widget se monta.
 *
 * `prefill` SE CONSUME, no se lee. `consumePrefill()` lo devuelve y lo pone a
 * `null` en el mismo acto, para que el texto se escriba UNA vez en el área de
 * texto y no vuelva a pisar lo que la persona esté tecleando en cada render.
 *
 * NO SE GUARDA NADA AQUÍ DE LA CONVERSACIÓN (mensajes, estado de la petición,
 * consumo): eso vive en `useChat` y en el estado local del widget. Este store
 * es sólo el mando a distancia.
 */
interface StrategistStore {
    /** ¿Está el cajón abierto? */
    isOpen: boolean
    /** ¿Hay un widget montado (módulo instalado) al que abrirle el cajón? */
    mounted: boolean
    /** Hilo activo. `null` = conversación nueva; la ruta creará el hilo y el
     *  widget adoptará el id que llegue en los metadatos del chunk `start`. */
    threadId: string | null
    /** Desde dónde se pregunta. Recorta las herramientas del turno. */
    screen: AssistantScreen
    /** Texto que el cajón debe encontrar escrito al abrirse. Se consume. */
    prefill: string | null

    /** Abre el cajón. Con `prompt` deja el texto escrito (NO lo envía: la
     *  persona decide si lo retoca antes de gastar un turno). */
    open: (opts?: { prompt?: string; screen?: AssistantScreen }) => void
    close: () => void
    setThread: (threadId: string | null) => void
    setScreen: (screen: AssistantScreen) => void
    setMounted: (mounted: boolean) => void
    /** Devuelve el prefill pendiente y lo borra. `null` si no había. */
    consumePrefill: () => string | null
}

export const useStrategistStore = create<StrategistStore>()((set, get) => ({
    isOpen: false,
    mounted: false,
    threadId: null,
    screen: 'other',
    prefill: null,

    open: (opts) =>
        set((state) => ({
            isOpen: true,
            // Un `prompt` vacío o sólo espacios NO borra el prefill anterior
            // ni escribe una cadena vacía: abrir el cajón desde el FAB no
            // debería tocar lo que ya había.
            prefill: opts?.prompt?.trim()
                ? opts.prompt.trim()
                : (state.prefill ?? null),
            screen: opts?.screen ?? state.screen,
        })),

    close: () => set({ isOpen: false }),

    setThread: (threadId) => set({ threadId }),

    setScreen: (screen) => set({ screen }),

    setMounted: (mounted) =>
        // Al desmontarse el widget (cambio de organización, módulo
        // desinstalado) el cajón NO puede quedarse "abierto" en el store: la
        // próxima vez que se monte aparecería solo.
        set(mounted ? { mounted: true } : { mounted: false, isOpen: false }),

    consumePrefill: () => {
        const { prefill } = get()
        if (prefill === null) return null
        set({ prefill: null })
        return prefill
    },
}))
