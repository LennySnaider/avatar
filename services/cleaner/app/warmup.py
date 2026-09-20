#!/usr/bin/env python3
"""Fuerza la descarga de los pesos de MI-GAN durante el `docker build`.

Importar el modulo no basta: el backend crea su sesion ONNX de forma perezosa,
asi que hay que pedirle una restauracion real. Se usa un lienzo sintetico de
64x64 con una mancha, que es lo mas barato que dispara la ruta completa.

Se ejecuta dos veces:
  - en el build, para que el peso quede horneado en la imagen;
  - en el arranque del servicio (`lifespan`), para crear la sesion ONNX antes
    de la primera peticion y para que `/health` pueda declarar `modelLoaded`.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def calentar() -> Path:
    """Ejecuta un borrado real con MI-GAN y devuelve la ruta del peso cacheado."""
    import numpy as np
    from remove_ai_watermarks import region_eraser

    if not region_eraser.migan_available():
        raise RuntimeError("el backend migan no esta disponible: falta el extra [migan]")

    lienzo = np.full((64, 64, 3), 200, dtype=np.uint8)
    lienzo[20:40, 20:40] = 30  # la region a restaurar
    mascara = np.zeros((64, 64), dtype=np.uint8)
    mascara[20:40, 20:40] = 255

    # `mask` y `backend` son argumentos por palabra clave en la firma real.
    resultado = region_eraser.erase(lienzo, mask=mascara, backend="migan")
    if resultado is None or resultado.shape != lienzo.shape:
        raise RuntimeError("MI-GAN no devolvio una imagen del mismo tamano")

    cache = Path(os.environ.get("HF_HOME", "~/.cache/huggingface")).expanduser()
    pesos = sorted(cache.rglob("*.onnx"))
    if not pesos:
        raise RuntimeError(f"MI-GAN corrio pero no dejo ningun .onnx bajo {cache}")
    return max(pesos, key=lambda p: p.stat().st_size)


if __name__ == "__main__":
    try:
        peso = calentar()
    except Exception as err:  # noqa: BLE001 - el build debe morir con el motivo a la vista
        print(f"ERROR calentando MI-GAN: {err}", file=sys.stderr)
        raise SystemExit(1) from err
    print(f"MI-GAN horneado: {peso} ({peso.stat().st_size // 1024} KB)")
