/**
 * COSTURA DE ENVÍO DE CORREO — un único punto de enchufe.
 *
 * POR QUÉ EXISTE: la recuperación de contraseña necesita mandar un correo,
 * pero elegir y contratar el proveedor (Resend, SES, Postmark, SMTP propio…)
 * es una decisión del dueño del proyecto, no de quien escribe el flujo. Sin
 * esta costura, esa decisión pendiente se filtra por todo el código: cada
 * ruta acabaría con su propio `fetch` al proveedor de turno y cambiarlo
 * después sería una cacería. Con la costura hay UN sitio que tocar —
 * `deliver()`, más abajo — y el resto del sistema no se entera de quién
 * transporta el correo.
 *
 * POR QUÉ LANZA EN VEZ DE FINGIR: el pecado que este trabajo corrige es
 * exactamente el código que devuelve éxito sin hacer nada (los endpoints de
 * recuperación hacían `return NextResponse.json(true)` y la UI cantaba
 * "hemos enviado el correo"). Un `sendEmail` que loguea y devuelve `void`
 * cuando no hay proveedor reproduce el mismo engaño una capa más abajo: el
 * flujo entero pasaría los tests, el usuario vería "revisa tu bandeja" y no
 * llegaría nada. Sin proveedor configurado esto LANZA, y quien llama decide
 * qué contarle al usuario.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * VARIABLES DE ENTORNO QUE HARÁN FALTA (ninguna está puesta hoy)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  EMAIL_PROVIDER   Selector del transporte. Hoy no hay ninguno implementado,
 *                   así que cualquier valor distinto de vacío también falla —
 *                   pero falla DICIENDO cuál pidió y cuáles conoce. Valores
 *                   previstos: 'resend' | 'ses' | 'postmark' | 'smtp'.
 *
 *  EMAIL_FROM       Remitente completo, p. ej. `Prime Avatar
 *                   <no-reply@tudominio.com>`. El dominio debe estar
 *                   verificado en el proveedor y tener SPF + DKIM (y a ser
 *                   posible DMARC): sin eso los correos transaccionales caen
 *                   en spam y el usuario cree que el reset no funciona.
 *
 *  EMAIL_REPLY_TO   Opcional. Buzón real al que puede contestar quien reciba
 *                   el correo; si se omite, las respuestas mueren en el
 *                   no-reply.
 *
 *  Y la credencial del proveedor elegido, sólo una de estas:
 *    RESEND_API_KEY                              (EMAIL_PROVIDER=resend)
 *    AWS_SES_REGION + AWS_ACCESS_KEY_ID
 *                  + AWS_SECRET_ACCESS_KEY       (EMAIL_PROVIDER=ses)
 *    POSTMARK_SERVER_TOKEN                       (EMAIL_PROVIDER=postmark)
 *    SMTP_HOST + SMTP_PORT + SMTP_USER
 *                  + SMTP_PASSWORD               (EMAIL_PROVIDER=smtp)
 *
 * NOTA DE SEGURIDAD: ninguna de estas variables lleva prefijo NEXT_PUBLIC_ a
 * propósito. Una clave de proveedor de correo con prefijo público se
 * embebería en el bundle del navegador y cualquiera podría mandar correo
 * firmado con el dominio del proyecto.
 */

/** Proveedores para los que hay hueco previsto. La lista es documentación, no capacidad. */
const PROVEEDORES_PREVISTOS = ['resend', 'ses', 'postmark', 'smtp'] as const

export interface SendEmailInput {
    /** Destinatario. Una sola dirección: los correos transaccionales no van a listas. */
    to: string
    subject: string
    /** Cuerpo HTML. */
    html: string
    /**
     * Alternativa en texto plano. No es decorativa: un correo sólo-HTML
     * puntúa peor en los filtros anti-spam y es ilegible en clientes que
     * bloquean HTML.
     */
    text: string
}

/**
 * Error propio (no un `Error` pelado) para que quien llame pueda distinguir
 * "no hay proveedor configurado" —un fallo de INFRAESTRUCTURA, culpa de la
 * instalación— de "el proveedor rechazó el envío", que es un fallo
 * operacional y se trata distinto (reintento, alerta).
 */
export class EmailNotConfiguredError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'EmailNotConfiguredError'
    }
}

/**
 * ¿Hay algo enchufado? Se expone para que un endpoint pueda decidir su
 * comportamiento ANTES de intentar el envío (p. ej. no crear un token de
 * reset que nadie va a poder entregar).
 *
 * Devuelve `false` mientras `deliver()` siga siendo el stub que lanza: la
 * bandera no se pone a `true` por tener una variable puesta, sino cuando de
 * verdad exista un transporte.
 */
export function isEmailConfigured(): boolean {
    return Boolean(process.env.EMAIL_PROVIDER) && PROVEEDOR_IMPLEMENTADO
}

/**
 * Interruptor honesto: se pone a `true` en el MISMO commit que implemente un
 * caso real dentro de `deliver()`. Mientras esté en `false`,
 * `isEmailConfigured()` no puede mentir aunque alguien exporte
 * `EMAIL_PROVIDER=resend` sin haber escrito el código de Resend.
 */
const PROVEEDOR_IMPLEMENTADO = false

/**
 * ÚNICO PUNTO DE ENCHUFE. Aquí y en ningún otro sitio se habla con el
 * proveedor. Para añadir uno: implementar su rama, quitar el `throw` final y
 * poner `PROVEEDOR_IMPLEMENTADO = true`.
 */
async function deliver(input: SendEmailInput): Promise<void> {
    const provider = (process.env.EMAIL_PROVIDER ?? '').trim().toLowerCase()

    if (!provider) {
        throw new EmailNotConfiguredError(
            'No hay proveedor de correo configurado: falta la variable de entorno EMAIL_PROVIDER ' +
                `(previstos: ${PROVEEDORES_PREVISTOS.join(', ')}) junto con EMAIL_FROM y la credencial del proveedor. ` +
                'Ver src/lib/email/send.ts para la lista completa.',
        )
    }

    // switch (provider) {
    //     case 'resend':   return enviarConResend(input)
    //     case 'ses':      return enviarConSes(input)
    //     case 'postmark': return enviarConPostmark(input)
    //     case 'smtp':     return enviarConSmtp(input)
    // }

    // `input` se referencia para que el stub no cambie de firma al implementar
    // el primer proveedor (y para que el linter no marque el parámetro).
    void input

    throw new EmailNotConfiguredError(
        `EMAIL_PROVIDER="${provider}" no tiene implementación en src/lib/email/send.ts. ` +
            `Proveedores con hueco previsto: ${PROVEEDORES_PREVISTOS.join(', ')}. ` +
            'Implementa su rama en deliver() y pon PROVEEDOR_IMPLEMENTADO = true.',
    )
}

/**
 * Envía un correo transaccional.
 *
 * LANZA `EmailNotConfiguredError` mientras no haya proveedor. No hay modo
 * "silencioso" ni "dry-run" a propósito: un envío que no se puede hacer tiene
 * que romper donde se pide, no convertirse en un log que nadie lee.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
    const to = input.to?.trim()
    if (!to) {
        throw new Error('sendEmail: falta el destinatario (to)')
    }
    if (!input.subject?.trim()) {
        throw new Error('sendEmail: falta el asunto (subject)')
    }
    if (!input.html?.trim() || !input.text?.trim()) {
        // Se exigen los dos cuerpos: ver el porqué en el comentario de `text`.
        throw new Error('sendEmail: hacen falta html y text')
    }

    const from = process.env.EMAIL_FROM?.trim()
    if (!from) {
        throw new EmailNotConfiguredError(
            'No hay remitente configurado: falta la variable de entorno EMAIL_FROM ' +
                '(p. ej. `Prime Avatar <no-reply@tudominio.com>`, con el dominio verificado y SPF/DKIM).',
        )
    }

    await deliver({ ...input, to })
}

export default sendEmail
