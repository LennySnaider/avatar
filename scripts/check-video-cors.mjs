/**
 * CENTINELA DE MODO CORS EN <video> — `npm run check:video-cors`
 *
 * POR QUÉ EXISTE (2026-08-20, reporte "a veces el vídeo del preview no carga"):
 * el navegador cachea una respuesta JUNTO CON su modo de petición. Si una
 * pantalla pide el objeto SIN `crossOrigin` y otra lo pide CON él, la segunda
 * reutiliza una entrada de caché que no trae aprobación CORS y el <video> se
 * queda MUDO: recuadro gris de 300×150 (el tamaño intrínseco de un elemento sin
 * fuente cargable), 0:00 / 0:00 y ni un error en consola.
 *
 * Era intermitente justamente por eso: fallaba solo si la card de la galería
 * había pre-cargado ese vídeo antes (`preload="metadata"` lo baja en cuanto
 * entra en pantalla), y no fallaba tras un refresco duro.
 *
 * La app ya había pagado esta lección UNA vez —VideoEditorMain lo documenta
 * para su filmstrip: "the preview poisons the HTTP cache with a non-CORS
 * response"— pero la conclusión se quedó en ese archivo. Esto la vuelve
 * verificable en TODOS.
 *
 * REGLA: todo <video> que pinte media NUESTRA (R2 / Supabase Storage, que sí
 * mandan Access-Control-Allow-Origin) declara `crossOrigin`. Un solo modo = una
 * sola entrada de caché.
 *
 * Las excepciones son de HOST AJENO, no de descuido: ponerles crossOrigin a
 * hosts que no mandan la cabecera los rompería del todo (hoy se ven, solo que
 * no se pueden leer desde un canvas).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = new URL('../src', import.meta.url).pathname

/** Archivos cuyo <video> apunta a un host que NO controlamos. */
const EXCEPCIONES = {
    'FanvuePostsClient.tsx': 'cover_url — CDN de Fanvue, CORS no garantizado',
    'Attachment.tsx': 'mediaUrl — adjuntos de Fanvue',
    'KlingMotionControlEditor.tsx': 'data: URL en base64 — sin origen que cruzar',
    'PostsClient.tsx':
        'media_urls apuntan al proyecto Supabase VIEJO (ya rotas por otro motivo)',
}

function* archivos(dir) {
    for (const nombre of readdirSync(dir)) {
        const ruta = join(dir, nombre)
        if (statSync(ruta).isDirectory()) yield* archivos(ruta)
        else if (nombre.endsWith('.tsx')) yield ruta
    }
}

const infracciones = []
let revisados = 0

for (const ruta of archivos(RAIZ)) {
    const nombre = ruta.split('/').pop()
    const texto = readFileSync(ruta, 'utf8')
    const lineas = texto.split('\n')
    lineas.forEach((linea, i) => {
        // `[\s/>]` exigía un carácter DESPUÉS de la etiqueta y en este repo
        // casi todas cierran la línea (`<video` y los atributos debajo): así
        // el detector solo veía los <video> escritos en comentarios. El `$`
        // es lo que lo hace mirar el código de verdad.
        if (!/<video(\s|\/|>|$)/.test(linea)) return
        // Los comentarios del repo hablan MUCHO de <video> (esta misma lección
        // está escrita en varios). Un detector que los cuenta es ruido que
        // acaba con el centinela desactivado, así que se descartan: línea de
        // comentario, o `<video` que aparece después de un // en la línea.
        const limpia = linea.trim()
        if (/^(\/\/|\*|\/\*)/.test(limpia)) return
        const posComentario = linea.indexOf('//')
        if (posComentario >= 0 && posComentario < linea.indexOf('<video')) return
        revisados++
        // La etiqueta se abre en una línea y se cierra varias más abajo. Cortar
        // en el primer `>` no vale: los comentarios de dentro de la etiqueta
        // llevan `>` (p.ej. "el <img> de al lado") y truncaban el bloque ANTES
        // del atributo, marcando como infractores a los que sí lo tienen.
        // Se recorren líneas DESCARTANDO comentarios hasta el cierre real.
        let tieneCrossOrigin = false
        for (let j = i; j < Math.min(i + 30, lineas.length); j++) {
            const l = lineas[j]
            const t = l.trim()
            if (/^(\/\/|\*|\/\*)/.test(t)) continue
            const sinComentario = l.split('//')[0]
            if (/crossOrigin/.test(sinComentario)) {
                tieneCrossOrigin = true
                break
            }
            // Cierre de la etiqueta de apertura: `>` o `/>` al final.
            if (j > i && /\/?>\s*$/.test(sinComentario.trimEnd())) break
            if (j === i && /\/?>\s*$/.test(sinComentario.trimEnd())) break
        }
        if (tieneCrossOrigin) return
        if (EXCEPCIONES[nombre]) return
        infracciones.push(
            `  ${ruta.replace(RAIZ, 'src')}:${i + 1}\n      ${linea.trim().slice(0, 90)}`,
        )
    })
}

console.log(`\n<video> revisados: ${revisados}`)
console.log(`Excepciones declaradas: ${Object.keys(EXCEPCIONES).length}`)
Object.entries(EXCEPCIONES).forEach(([f, motivo]) =>
    console.log(`  · ${f.padEnd(32)} ${motivo}`),
)

if (infracciones.length) {
    console.error(
        `\n❌ ${infracciones.length} <video> sin crossOrigin sobre media propia:\n`,
    )
    infracciones.forEach((i) => console.error(i))
    console.error(
        '\nMezclar modos envenena la caché HTTP: la pantalla que pide primero\n' +
            'fija la entrada, y la que pide con crossOrigin después falla en\n' +
            'silencio (recuadro gris, 0:00, sin error). Añade crossOrigin, o\n' +
            'declara el archivo en EXCEPCIONES si su host es ajeno.\n',
    )
    process.exit(1)
}

console.log('\n✓ Un solo modo CORS en toda la app\n')
