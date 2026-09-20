#!/usr/bin/env python3
"""Mide que marcas y metadatos trae cada motor, y que queda tras limpiar.

Corre DENTRO del contenedor `aimarks-engine` (el spike no instala nada en la
maquina del desarrollador). Recorre un directorio con una subcarpeta por motor
y por cada archivo hace cuatro pasadas, en el mismo orden que hara el servicio:

  1. `identify`         sobre el original  -> que trae de fabrica
  2. `visible`/`video`  -> borra el logo si hay uno registrado
  3. `metadata --remove` -> SIEMPRE, sobre el resultado del paso 2
  4. `identify`         sobre la salida    -> que sobrevivio

El paso 3 es separado a proposito. Medido el 2026-09-20: `visible` sale con
codigo 2 y NO escribe nada cuando no encuentra un logo registrado, y el borrado
de metadatos que ese comando promete solo se aplica al archivo que escribe. En
la muestra real la mayoria de las generaciones no traen logo pero SI traen C2PA,
asi que encadenar el borrado al comando visible dejaria los metadatos intactos
justo en el caso comun.

Tambien se trabaja sobre una COPIA en directorio escribible: `video all` crea su
temporal junto al archivo de origen, no en /tmp, y muere si la carpeta es de
solo lectura.

El resultado sale como JSONL por stdout: una linea por archivo, agregada despues
por `resumir.py`. JSONL y no CSV porque `watermarks` y `signals` son listas de
longitud variable.

Uso:
    python3 medir.py /muestras /trabajo /salida > informe.jsonl
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

IMAGENES = {".png", ".jpg", ".jpeg", ".webp"}
VIDEOS = {".mp4", ".mov", ".m4v", ".webm", ".mkv"}

# Tope por archivo: sin el, una muestra rara bloquea toda la medicion.
TOPE_IMAGEN_S = 300
TOPE_VIDEO_S = 900

# El CLI usa codigos distintos de cero para desenlaces legitimos. 2 en `visible`
# es "no encontre ninguna marca registrada", que no es una averia.
CODIGO_SIN_MARCA = 2


def correr(argv: list[str], tope: int) -> tuple[int, str, str, float]:
    inicio = time.monotonic()
    try:
        proc = subprocess.run(argv, capture_output=True, text=True, timeout=tope)
        return proc.returncode, proc.stdout, proc.stderr, time.monotonic() - inicio
    except subprocess.TimeoutExpired:
        return 124, "", f"timeout tras {tope}s", time.monotonic() - inicio


def identificar(ruta: Path, tope: int, es_video: bool = False) -> dict:
    """`identify --json`. Nunca lanza: un fallo tambien es un dato del informe.

    El CLI tiene dos identify distintos: el de imagen rechaza un .mp4 (imprime
    un aviso ANTES del JSON y lo vuelve inparseable) y el de video usa el mismo
    arbitro temporal que la limpieza. Se elige por tipo, y ademas se recorta
    todo lo anterior a la primera llave por si alguna version vuelve a anteponer
    avisos a la salida.
    """
    argv = ["remove-ai-watermarks"]
    argv += ["video", "identify", "--json", str(ruta)] if es_video else ["identify", "--json", str(ruta)]
    codigo, salida, error, segundos = correr(argv, tope)
    if codigo != 0:
        return {"error": (error or salida or "sin salida").strip()[:400], "segundos": round(segundos, 2)}
    crudo = salida[salida.index("{"):] if "{" in salida else salida
    try:
        informe = json.loads(crudo)
    except json.JSONDecodeError:
        return {"error": f"json invalido: {salida[:200]}", "segundos": round(segundos, 2)}
    informe["segundos"] = round(segundos, 2)
    return informe


def paso_visible(origen: Path, destino: Path, es_video: bool) -> dict:
    """Borra el logo registrado. `escribio=False` sin error = no habia logo."""
    destino.parent.mkdir(parents=True, exist_ok=True)
    if es_video:
        argv = ["remove-ai-watermarks", "video", "all", str(origen), "-o", str(destino)]
        tope = TOPE_VIDEO_S
    else:
        # migan: el tier aprendido ligero (~28 MB, ~950 MB de RAM). cv2 mancha
        # fondos con estructura y LaMa pide ~4.7 GB, fuera del contenedor de 4 GB.
        argv = ["remove-ai-watermarks", "visible", str(origen), "-o", str(destino), "--backend", "migan"]
        tope = TOPE_IMAGEN_S
    codigo, salida, error, segundos = correr(argv, tope)
    escribio = destino.exists() and destino.stat().st_size > 0
    return {
        "codigo": codigo,
        "sin_marca": codigo == CODIGO_SIN_MARCA and not escribio,
        "stdout": salida.strip()[:1000],
        "stderr": error.strip()[:500],
        "segundos": round(segundos, 2),
        "escribio": escribio,
        "bytes": destino.stat().st_size if escribio else 0,
    }


def paso_metadatos(origen: Path, destino: Path, es_video: bool) -> dict:
    """`metadata --remove`, siempre. Es el paso que de verdad quita el C2PA."""
    destino.parent.mkdir(parents=True, exist_ok=True)
    argv = ["remove-ai-watermarks"]
    if es_video:
        argv += ["video", "metadata", str(origen), "--remove", "-o", str(destino)]
    else:
        argv += ["metadata", str(origen), "--remove", "-o", str(destino)]
    codigo, salida, error, segundos = correr(argv, TOPE_VIDEO_S)
    escribio = destino.exists() and destino.stat().st_size > 0
    return {
        "codigo": codigo,
        "stdout": salida.strip()[:1000],
        "stderr": error.strip()[:500],
        "segundos": round(segundos, 2),
        "escribio": escribio,
        "bytes": destino.stat().st_size if escribio else 0,
    }


def main() -> int:
    if len(sys.argv) < 4:
        print("uso: medir.py <dir-muestras> <dir-trabajo> <dir-salida>", file=sys.stderr)
        return 2
    raiz, trabajo_raiz, salida_raiz = (Path(a) for a in sys.argv[1:4])

    archivos = sorted(p for p in raiz.rglob("*") if p.is_file() and not p.name.startswith("."))
    for indice, archivo in enumerate(archivos, 1):
        ext = archivo.suffix.lower()
        if ext not in IMAGENES and ext not in VIDEOS:
            print(json.dumps({"archivo": str(archivo), "saltado": f"extension {ext}"}), flush=True)
            continue
        es_video = ext in VIDEOS
        motor = archivo.parent.name
        tope = TOPE_VIDEO_S if es_video else TOPE_IMAGEN_S
        print(f"[{indice}/{len(archivos)}] {motor}/{archivo.name}", file=sys.stderr, flush=True)

        fila: dict = {
            "motor": motor,
            "archivo": archivo.name,
            "tipo": "video" if es_video else "imagen",
            "bytes": archivo.stat().st_size,
        }
        fila["antes"] = identificar(archivo, tope, es_video)

        # Copia escribible: `video all` deja su temporal junto al origen.
        trabajo = trabajo_raiz / motor / archivo.name
        trabajo.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(archivo, trabajo)

        tras_visible = salida_raiz / motor / f"{archivo.stem}.v{archivo.suffix}"
        fila["visible"] = paso_visible(trabajo, tras_visible, es_video)

        # Si no hubo logo, el paso de metadatos trabaja sobre la copia intacta.
        entrada_meta = tras_visible if fila["visible"]["escribio"] else trabajo
        final = salida_raiz / motor / f"{archivo.stem}.limpio{archivo.suffix}"
        fila["metadatos"] = paso_metadatos(entrada_meta, final, es_video)

        fila["despues"] = (
            identificar(final, tope, es_video)
            if fila["metadatos"]["escribio"]
            else {"error": "el paso de metadatos no escribio"}
        )
        fila["segundos_total"] = round(fila["visible"]["segundos"] + fila["metadatos"]["segundos"], 2)

        trabajo.unlink(missing_ok=True)
        print(json.dumps(fila, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
