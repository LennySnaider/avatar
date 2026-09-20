#!/usr/bin/env bash
# Descarga las muestras reales de R2 listadas en muestras.tsv.
#
# Van al scratchpad de la sesion, NO al repo: son generaciones de clientes y no
# tienen por que acabar en git ni en la imagen de Docker.
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
DESTINO="${1:?uso: descargar.sh <directorio-destino>}"

# La base publica sale del .env del proyecto, no se hardcodea: cambia con el
# bucket. Se miran los dos archivos en el orden de precedencia de Next.js
# (.env.local gana sobre .env); hoy el valor vive en .env, pero dar por hecho
# uno solo es justo el fallo que costo una descarga vacia.
BASE=""
for archivo in "$RAIZ/.env.local" "$RAIZ/.env"; do
    [ -f "$archivo" ] || continue
    # `|| true`: que el archivo no tenga la variable es un resultado valido, no
    # un error. Sin esto `set -e` mata el script en silencio y ni siquiera se
    # llega a imprimir el mensaje de abajo.
    valor="$(grep -E '^NEXT_PUBLIC_R2_PUBLIC_BASE_URL=' "$archivo" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' \r' || true)"
    if [ -n "$valor" ]; then
        BASE="$valor"
        break
    fi
done
if [ -z "$BASE" ]; then
    echo "ERROR: falta NEXT_PUBLIC_R2_PUBLIC_BASE_URL en .env.local y .env" >&2
    exit 1
fi

mkdir -p "$DESTINO"
ok=0
falla=0

# `read -r` sin IFS parte por tabulador; el nombre del motor lleva espacios.
tail -n +2 "$AQUI/muestras.tsv" | while IFS=$'\t' read -r motor tipo ruta; do
    [ -z "${ruta:-}" ] && continue
    # Carpeta por motor con el nombre saneado: el CLI del motor recorre
    # directorios y queremos un informe por proveedor.
    carpeta="$DESTINO/$(echo "$motor" | tr ' .' '__')"
    mkdir -p "$carpeta"
    salida="$carpeta/$(basename "$ruta")"
    if [ -s "$salida" ]; then
        continue
    fi
    if curl -fsSL --max-time 120 "$BASE/$ruta" -o "$salida"; then
        ok=$((ok + 1))
        printf '.'
    else
        falla=$((falla + 1))
        rm -f "$salida"
        echo ""
        echo "FALLO: $ruta" >&2
    fi
done

echo ""
echo "Descargadas en $DESTINO:"
find "$DESTINO" -type f | wc -l | tr -d ' '
du -sh "$DESTINO" | cut -f1
