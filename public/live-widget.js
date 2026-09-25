/**
 * Widget del modo en vivo (módulo live_avatar) para cualquier web:
 *
 *   <script src="https://<app>/live-widget.js" data-token="<token>" async></script>
 *
 * Pinta un botón flotante que abre la llamada con el avatar en un iframe de
 * nuestra página pública /live/<token>. Todo el audio, la cara y la
 * conversación viven dentro del iframe; esta web no ve nada de eso.
 * Atributos opcionales: data-label (texto del botón), data-position
 * ("left" | "right").
 */
;(function () {
    var script = document.currentScript
    if (!script) return
    var token = script.getAttribute('data-token')
    if (!token) return
    var origin = new URL(script.src).origin
    var label = script.getAttribute('data-label') || 'Hablar en vivo'
    var side = script.getAttribute('data-position') === 'left' ? 'left' : 'right'

    var button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.setAttribute('aria-label', label)
    button.style.cssText =
        'position:fixed;bottom:20px;' + side + ':20px;z-index:2147483646;padding:12px 18px;border:0;' +
        'border-radius:999px;background:#111827;color:#fff;font:600 14px/1 system-ui,sans-serif;' +
        'box-shadow:0 8px 24px rgba(0,0,0,.25);cursor:pointer'

    var panel = null
    function open() {
        if (panel) return
        panel = document.createElement('div')
        panel.style.cssText =
            'position:fixed;bottom:80px;' + side + ':20px;z-index:2147483647;width:min(380px,calc(100vw - 40px));' +
            'height:min(640px,calc(100vh - 120px));border-radius:16px;overflow:hidden;' +
            'box-shadow:0 16px 48px rgba(0,0,0,.35);background:#030712'
        var frame = document.createElement('iframe')
        frame.src = origin + '/live/' + encodeURIComponent(token)
        frame.allow = 'microphone; autoplay'
        frame.title = label
        frame.style.cssText = 'width:100%;height:100%;border:0'
        panel.appendChild(frame)
        document.body.appendChild(panel)
        button.textContent = 'Cerrar'
    }
    function close() {
        if (!panel) return
        // Quitar el iframe dispara su `pagehide`: la llamada se cuelga sola.
        panel.remove()
        panel = null
        button.textContent = label
    }
    button.addEventListener('click', function () {
        if (panel) close()
        else open()
    })
    if (document.body) document.body.appendChild(button)
    else document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(button) })
})()
