/**
 * Ajustes del módulo `ai-mark-cleaner` para una organización.
 *
 * Viven en `org_modules.settings` (JSONB, columna sin forma): los escribe el
 * cajón de ajustes y los lee la ruta de persistencia. Entre esas dos está este
 * fichero, con el mismo criterio que `src/lib/assistant/budget.ts`: un JSON con
 * basura nunca debe tumbar un guardado NI, peor, encender en silencio algo que
 * el tenant había apagado. Cada campo se lee POR SEPARADO y cae a su valor por
 * defecto sin arrastrar a los demás.
 *
 * PURO: sin imports. Testeable con `tsx --test`.
 */

/** Qué tipos de medio limpia el módulo en esta organización. */
export interface AiMarkCleanerSettings {
    /** Limpiar las imágenes generadas. */
    images: boolean
    /** Limpiar los vídeos generados. */
    videos: boolean
    /**
     * Limpiar también las referencias de cara/ángulo que sube el usuario.
     * No se cobran: son entrada del usuario, no una generación.
     */
    references: boolean
}

/**
 * Todo encendido al instalar. El módulo se instala a propósito, así que el
 * tenant ya expresó que quiere limpieza; obligarle a encender tres casillas
 * después sería una trampa silenciosa.
 */
export const DEFAULT_AI_MARK_CLEANER_SETTINGS: AiMarkCleanerSettings = {
    images: true,
    videos: true,
    references: true,
}

/**
 * NO existe un campo `synthid`. El cajón de ajustes pinta esa fila
 * deshabilitada como "próximamente", y guardar la clave ahora sería prometer
 * un comportamiento que el código no tiene: alguien lo pondría en `true` y no
 * pasaría nada. Se añadirá el día que exista la GPU detrás (ver
 * `docs/ai-marks/README.md`, sección Futuro).
 */

function leerBooleano(fuente: Record<string, unknown>, clave: string, porDefecto: boolean): boolean {
    const valor = fuente[clave]
    return typeof valor === 'boolean' ? valor : porDefecto
}

/**
 * Normaliza lo que venga de la base a unos ajustes usables.
 *
 * Un `null`, un array, un string o un campo con el tipo equivocado caen al
 * valor por defecto de ESE campo, no de todos.
 */
export function leerAjustes(crudo: unknown): AiMarkCleanerSettings {
    if (crudo === null || typeof crudo !== 'object' || Array.isArray(crudo)) {
        return { ...DEFAULT_AI_MARK_CLEANER_SETTINGS }
    }
    const fuente = crudo as Record<string, unknown>
    return {
        images: leerBooleano(fuente, 'images', DEFAULT_AI_MARK_CLEANER_SETTINGS.images),
        videos: leerBooleano(fuente, 'videos', DEFAULT_AI_MARK_CLEANER_SETTINGS.videos),
        references: leerBooleano(fuente, 'references', DEFAULT_AI_MARK_CLEANER_SETTINGS.references),
    }
}

/**
 * Aplica un cambio parcial sobre unos ajustes ya normalizados.
 *
 * Devuelve un objeto nuevo; los campos ausentes o con tipo inválido en el
 * parche se dejan como estaban, para que un cliente antiguo que no conoce un
 * campo no lo borre al guardar.
 */
export function aplicarParche(
    actuales: AiMarkCleanerSettings,
    parche: Partial<AiMarkCleanerSettings>,
): AiMarkCleanerSettings {
    return {
        images: typeof parche.images === 'boolean' ? parche.images : actuales.images,
        videos: typeof parche.videos === 'boolean' ? parche.videos : actuales.videos,
        references:
            typeof parche.references === 'boolean' ? parche.references : actuales.references,
    }
}

/** ¿Está activada la limpieza para este tipo de medio? */
export function limpiaEsteTipo(
    ajustes: AiMarkCleanerSettings,
    mediaType: 'IMAGE' | 'VIDEO',
): boolean {
    return mediaType === 'VIDEO' ? ajustes.videos : ajustes.images
}
