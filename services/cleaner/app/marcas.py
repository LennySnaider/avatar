"""Mapa proveedor -> marca registrada del motor.

POR QUE EXISTE (medido el 2026-09-20, spike de 118 generaciones reales):
con `--mark auto` el motor prueba las siete marcas de video y se queda con la
primera que encaje. En dos videos de MiniMax Hailuo la silueta de Kling encajo
en los 141 fotogramas sobre una pierna y el marco de una puerta: falso positivo
que no solo ensucia el informe, sino que recodifica el video entero para
rellenar una region donde no habia nada. Con `--mark hailuo` el mismo archivo
responde "no hay marca estable" y no escribe nada.

Nosotros SI sabemos que motor genero cada archivo (`generations.metadata`), asi
que dejarselo adivinar al detector es tirar informacion que ya tenemos.

Un proveedor sin entrada aqui cae a `auto`, que es el comportamiento de antes:
mejor arriesgar un falso positivo que no mirar. Un proveedor mapeado a `None`
declara "este motor no estampa ningun logo" y se salta el paso visible entero.
"""

from __future__ import annotations

# Claves que el motor acepta hoy en `video visible --mark`.
MARCAS_VIDEO = {"auto", "sora", "veo", "seedance", "doubao", "dola", "hailuo", "kling"}

# Claves de `visible --mark` para imagen.
MARCAS_IMAGEN = {
    "auto", "gemini", "doubao", "jimeng", "qwen", "kling", "yuanbao",
    "samsung", "runninghub", "baidu", "liblib", "liblib_pill",
    "microsoft", "jimeng_pill",
}

# El `providerName` que guarda `generations.metadata` -> marca del motor.
# `None` = este motor no estampa logo; se salta el paso visible.
# Ausente  = `auto`.
#
# Las entradas `None` salen de la medicion: 8/8 de Kling 3.0 y 6/6 de Hailuo
# llegaron sin logo alguno, y 24/24 de las imagenes de GPT Image 2, Gemini y
# Grok tampoco traian logo salvo 2 sparkles de Gemini.
POR_PROVEEDOR: dict[str, str | None] = {
    # --- Video
    "Kling 3.0 · KIE": "kling",
    "MiniMax Hailuo 2.3": "hailuo",
    "MiniMax Hailuo 2.3 Fast": "hailuo",
    "Seedance 2.0 (KIE)": "seedance",
    "Seedance 2.5 · KIE": "seedance",
    "Grok Imagine Video 1.5 · KIE": None,
    "Wan 2.6 · MuleRouter": None,
    "Wan 2.6 i2v · MuleRouter": None,
    "Wan 2.7 i2v (KIE)": None,
    "Wan 2.7 · KIE": None,
    "Wan 2.2 Sin Censura · KIE": None,
    "Wan 3.0 Sin Censura · KIE": None,
    # --- Imagen
    "Gemini 3.1 Flash Lite Image": "gemini",
    "Gemini 3 Pro Image": "gemini",
    "Nano Banana 2 · KIE": "gemini",
    "Nano Banana 2 Lite · KIE": "gemini",
    "Nano Banana Pro · KIE": "gemini",
    "Qwen Image 2.0 · KIE": "qwen",
    "Qwen Edit Max · MuleRouter": "qwen",
    "GPT Image 2 · KIE": None,
    "Grok Imagine · KIE": None,
    "Seedream 5.0 Pro · KIE": None,
    "Seedream 5.0 Lite · KIE": None,
    "Seedream 4.5 · KIE": None,
    "Wan 2.7 Image · KIE": None,
    "Wan 2.7 Image Pro · KIE": None,
    "FLUX.2 Pro · KIE": None,
    "MiniMax image-01": None,
}


class Decision:
    """Que hacer con el paso visible para un proveedor dado."""

    __slots__ = ("marca", "saltar")

    def __init__(self, marca: str, saltar: bool) -> None:
        self.marca = marca
        self.saltar = saltar

    def __repr__(self) -> str:  # pragma: no cover - solo para depurar
        return f"Decision(marca={self.marca!r}, saltar={self.saltar})"


def decidir_marca(proveedor: str | None, es_video: bool) -> Decision:
    """Marca a pedirle al motor para este proveedor.

    - Proveedor desconocido o vacio -> `auto` (mirar todo, como antes).
    - Proveedor mapeado a `None`    -> saltar el paso visible.
    - Proveedor mapeado a una clave que el motor NO acepta para este tipo de
      medio -> `auto`, en vez de mandar un argumento que el CLI rechazaria.
    """
    if not proveedor:
        return Decision("auto", saltar=False)
    if proveedor not in POR_PROVEEDOR:
        return Decision("auto", saltar=False)
    marca = POR_PROVEEDOR[proveedor]
    if marca is None:
        return Decision("auto", saltar=True)
    validas = MARCAS_VIDEO if es_video else MARCAS_IMAGEN
    if marca not in validas:
        return Decision("auto", saltar=False)
    return Decision(marca, saltar=False)
