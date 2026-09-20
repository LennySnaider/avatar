#!/usr/bin/env python3
"""Agrega el JSONL de `medir.py` en las tablas del informe del spike.

Corre en la maquina anfitriona (solo stdlib). Lee el JSONL por argumento o por
stdin y escribe Markdown en stdout.
"""

from __future__ import annotations

import json
import statistics
import sys
from collections import defaultdict


def marcas(informe: dict) -> list[str]:
    """Marcas declaradas. Imagen usa `watermarks`; video usa `visible_mark`."""
    encontradas = list(informe.get("watermarks") or [])
    visible = informe.get("visible_mark")
    if visible:
        encontradas.append(f"marca visible: {visible}")
    marcadores = informe.get("metadata_markers") or {}
    encontradas.extend(f"meta: {clave}" for clave in marcadores)
    return encontradas


def senales(informe: dict) -> list[str]:
    nombres = [s.get("name", "?") for s in (informe.get("signals") or [])]
    if informe.get("has_ai_metadata"):
        nombres.append("meta_video")
    return nombres


def mediana(valores: list[float]) -> float:
    return round(statistics.median(valores), 2) if valores else 0.0


def main() -> int:
    origen = open(sys.argv[1], encoding="utf-8") if len(sys.argv) > 1 else sys.stdin
    filas = []
    for linea in origen:
        linea = linea.strip()
        if not linea:
            continue
        dato = json.loads(linea)
        if "saltado" in dato:
            continue
        filas.append(dato)

    por_motor: dict[str, list[dict]] = defaultdict(list)
    for fila in filas:
        por_motor[fila["motor"]].append(fila)

    print(f"Muestras medidas: {len(filas)} en {len(por_motor)} motores.")
    print()
    print("| Motor | Tipo | n | Traía de fábrica | Logo visible | Metadatos borrados | Queda después | s logo | s meta |")
    print("|---|---|---|---|---|---|---|---|---|")
    for motor in sorted(por_motor):
        grupo = por_motor[motor]
        tipo = grupo[0]["tipo"]
        antes_marcas: set[str] = set()
        despues_marcas: set[str] = set()
        con_logo = 0
        meta_ok = 0
        con_meta_antes = 0
        t_logo, t_meta = [], []
        for fila in grupo:
            antes = fila.get("antes", {})
            antes_marcas.update(marcas(antes))
            if marcas(antes):
                con_meta_antes += 1
            visible = fila.get("visible", {})
            metadatos = fila.get("metadatos", {})
            # En imagen, `escribio` del paso visible significa "habia logo".
            # En video, `video all` siempre escribe, asi que el logo se lee del
            # texto del propio comando.
            if fila["tipo"] == "video":
                if "none found" not in (visible.get("stdout") or ""):
                    con_logo += 1
            elif visible.get("escribio"):
                con_logo += 1
            if metadatos.get("escribio"):
                meta_ok += 1
                despues_marcas.update(marcas(fila.get("despues", {})))
            t_logo.append(visible.get("segundos", 0))
            t_meta.append(metadatos.get("segundos", 0))
        queda = ", ".join(sorted(despues_marcas)) or "nada"
        print(
            f"| {motor.replace('_', ' ')} | {tipo} | {len(grupo)} "
            f"| {con_meta_antes}/{len(grupo)} con señal "
            f"| {con_logo}/{len(grupo)} | {meta_ok}/{len(grupo)} | {queda} "
            f"| {mediana(t_logo)} | {mediana(t_meta)} |"
        )

    print()
    print("### Qué trae cada motor de fábrica")
    print()
    for motor in sorted(por_motor):
        todas: set[str] = set()
        for fila in por_motor[motor]:
            todas.update(marcas(fila.get("antes", {})))
        print(f"- **{motor.replace('_', ' ')}**: {', '.join(sorted(todas)) or 'ninguna señal detectable'}")

    # Cualquier fila con marcas despues de limpiar es una fuga: hay que verla.
    fugas = [f for f in filas if marcas(f.get("despues", {}))]
    print()
    print(f"### Fugas (algo sobrevivió a la limpieza): {len(fugas)}")
    for fila in fugas:
        print(f"- {fila['motor']}/{fila['archivo']}: {', '.join(marcas(fila['despues']))}")

    errores = [f for f in filas if f.get("despues", {}).get("error") or f.get("antes", {}).get("error")]
    print()
    print(f"### Errores del arnés: {len(errores)}")
    for fila in errores[:15]:
        motivo = fila.get("despues", {}).get("error") or fila.get("antes", {}).get("error")
        print(f"- {fila['motor']}/{fila['archivo']}: {str(motivo)[:150]}")

    tiempos_img = [f["segundos_total"] for f in filas if f["tipo"] == "imagen" and "segundos_total" in f]
    tiempos_vid = [f["segundos_total"] for f in filas if f["tipo"] == "video" and "segundos_total" in f]
    print()
    print("### Tiempos de limpieza (segundos, sin contar los `identify` del arnés)")
    print()
    print("| Tipo | n | mediana | máx |")
    print("|---|---|---|---|")
    for etiqueta, valores in (("imagen", tiempos_img), ("video", tiempos_vid)):
        if valores:
            print(f"| {etiqueta} | {len(valores)} | {mediana(valores)} | {round(max(valores), 2)} |")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
