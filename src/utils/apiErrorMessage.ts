/**
 * Extrae un mensaje LEGIBLE de lo que rechaza `ApiService.fetchDataWithAxios`.
 *
 * POR QUÉ hace falta: los formularios heredados de la plantilla ECME hacen
 * `catch (error) { setMessage(error as string) }` y luego pintan ese valor con
 * `<span>{message}</span>`. Pero lo que llega NO es un string: `ApiService`
 * rechaza con el `AxiosError` entero. Mientras las rutas devolvían 200 el
 * catch no se ejecutaba nunca y nadie lo notó; en cuanto una ruta responde un
 * error de verdad, ese `as string` miente y React revienta el render con
 * "Objects are not valid as a React child" — un cartel de error genérico en
 * lugar del motivo. El `as string` es un cast, no una conversión: TypeScript
 * se calla justamente donde hacía falta que hablara.
 *
 * Orden de preferencia: el `message` que manda el servidor (es el redactado
 * para la persona) > el `message` del propio error (red, timeout) > un texto
 * genérico. Nunca se devuelve el objeto crudo.
 */

/** Forma mínima de un error de axios; no se importa el tipo para no atar este util a la librería. */
type MaybeAxiosError = {
    response?: { data?: unknown }
    message?: unknown
}

const GENERIC = 'Something went wrong. Please try again.'

const apiErrorMessage = (
    error: unknown,
    fallback: string = GENERIC,
): string => {
    if (typeof error === 'string' && error.trim()) return error

    const err = error as MaybeAxiosError | null

    const data = err?.response?.data
    if (typeof data === 'string' && data.trim()) return data
    if (data && typeof data === 'object') {
        const { message, error: errField } = data as {
            message?: unknown
            error?: unknown
        }
        if (typeof message === 'string' && message.trim()) return message
        if (typeof errField === 'string' && errField.trim()) return errField
    }

    if (typeof err?.message === 'string' && err.message.trim()) {
        return err.message
    }

    return fallback
}

export default apiErrorMessage
