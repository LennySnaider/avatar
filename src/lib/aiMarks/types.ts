/**
 * Tipos del limpiador de marcas de IA. Módulo PURO: sólo tipos y constantes.
 *
 * REGLA DE DISEÑO: aquí no hay ningún `T | null`. Un nulo mezclaría tres cosas
 * distintas que la UI tiene que saber distinguir —"no había nada que limpiar",
 * "el módulo está apagado" y "no pude preguntar"— y el repo ya se quemó con
 * ese patrón (ver la nota `fail-sin-log-y-null-con-tres-sentidos` en la
 * memoria del proyecto). Cada desenlace lleva su propia etiqueta.
 */

/** El slug del módulo instalable. Una sola fuente para toda la feature. */
export const MODULO_AI_MARKS = 'ai-mark-cleaner'

/**
 * Estado de limpieza de una generación. Vive en la columna
 * `generations.ai_marks_status`, no dentro de `metadata`: ese JSON lo
 * reescribe entero `apiUpdateGenerationMetadata` desde la copia del cliente
 * cada vez que alguien marca un favorito, así que un vídeo que termina de
 * limpiarse 90 s después quedaría pisado por el siguiente clic.
 */
export type EstadoAiMarks =
    /** Generación anterior a la feature. Nadie la ha mirado. */
    | 'none'
    /** No se intenta: módulo apagado, ajuste apagado, formato no soportado. */
    | 'skipped'
    /** Encolada. Es el estado en el que nace una fila con el módulo activo. */
    | 'pending'
    /** Un trabajador la tiene tomada. */
    | 'running'
    /** Se quitó algo y el objeto limpio ya es el que sirve la galería. */
    | 'cleaned'
    /** Se escribió el limpio pero algo sobrevivió. Se sirve igual. */
    | 'partial'
    /** El motor no encontró nada que quitar. El original se queda. */
    | 'no_marks'
    /** Se agotaron los intentos. El original se sirve y se avisa. */
    | 'failed'

/** Por qué no se intentó limpiar. */
export type MotivoSalto =
    | 'modulo_apagado'
    | 'ajuste_apagado'
    | 'formato_no_soportado'
    | 'almacenamiento_no_r2'
    | 'ya_limpia'

/** Qué pasó con una marca visible concreta. */
export interface MarcaVisible {
    /** Etiqueta del motor, p. ej. `gemini`. */
    etiqueta: string
    confianzaAntes: number
    confianzaDespues: number
    estado: 'removida' | 'persiste' | 'sin_validar'
}

/** Lo que el servicio informa de los metadatos. */
export interface InformeMetadatos {
    encontrados: string[]
    removidos: string[]
    /** Lo que seguía ahí tras el borrado. Vacío es el caso bueno. */
    sobrevivientes: string[]
}

/** Informe completo de un trabajo de limpieza. Se guarda en `ai_marks.report`. */
export interface InformeLimpieza {
    estado: 'cleaned' | 'partial' | 'no_marks' | 'rejected'
    /** Sólo en `rejected`: por qué el motor no quiso tocar el archivo. */
    motivo?: string
    visibles: MarcaVisible[]
    metadatos: InformeMetadatos
    backend: string
    versionMotor: string
    duracionMs: number
    /**
     * `false` cuando no había nada que quitar y por tanto no se escribió
     * ningún objeto nuevo. Quien llama conserva la ruta original.
     */
    escribioSalida: boolean
    escribioMiniatura: boolean
}

/**
 * Respuesta del cliente HTTP del servicio limpiador.
 *
 * `ok: false` distingue el motivo porque cada uno se trata distinto: `ocupado`
 * y `timeout` merecen reintento, y un `http` 4xx casi nunca.
 */
export type ResultadoServicio =
    | { ok: true; informe: InformeLimpieza }
    | {
          ok: false
          motivo: 'ocupado' | 'timeout' | 'red' | 'http'
          estadoHttp?: number
          mensaje: string
      }

/** Desenlace de `ejecutarTrabajo`. Todos los caminos tienen nombre. */
export type DesenlaceTrabajo =
    /** Otro trabajador se lo llevó primero. No es un error. */
    | { estado: 'no_tomado' }
    | { estado: 'saltado'; motivo: MotivoSalto }
    | {
          estado: 'cleaned' | 'partial' | 'no_marks'
          informe: InformeLimpieza
          /** La ruta que la fila sirve ahora. Igual a la original si no se limpió. */
          rutaFinal: string
          tokensCobrados: number
      }
    | { estado: 'reintento_programado'; intentos: number; error: string }
    | { estado: 'fallido'; intentos: number; error: string }

/** Estado persistido en la columna `generations.ai_marks` (JSONB). */
export interface EstadoPersistido {
    informe?: InformeLimpieza
    rutaOriginal: string
    miniaturaOriginal?: string
    rutaLimpia?: string
    miniaturaLimpia?: string
    intentos: number
    tomadaEn?: string
    siguienteIntentoEn?: string
    error?: string
    registradaEn: string
    terminadaEn?: string
    /** Cuándo se puede borrar el original. Se espera por las pestañas abiertas. */
    purgarOriginalTras?: string
    originalPurgadoEn?: string
    tokensCobrados?: number
    errorCobro?: string
    motivoSalto?: MotivoSalto
}

/** Estados en los que la fila todavía tiene trabajo pendiente. */
export const ESTADOS_CON_TRABAJO: readonly EstadoAiMarks[] = ['pending', 'running']

/** Estados terminales en los que el objeto limpio ya es el que se sirve. */
export const ESTADOS_LIMPIOS: readonly EstadoAiMarks[] = ['cleaned', 'partial']
