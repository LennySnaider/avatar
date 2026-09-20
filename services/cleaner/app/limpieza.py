"""El trabajo real: quitar el logo y borrar los metadatos de un archivo local.

Usa la API de Python del motor, NO el CLI: `remove_visible_detailed` devuelve un
`MarkRemovalResult` por marca (etiqueta, confianza antes/despues, estado) y
`strip_and_verify` devuelve los marcadores que sobrevivieron. Parsear el texto
del CLI daria lo mismo pero se romperia en la siguiente version.

DOS DECISIONES QUE SALEN DE MEDIR (spike del 2026-09-20, 118 generaciones
reales de 15 motores):

1. El borrado de metadatos es un PASO PROPIO y siempre corre. `remove_visible`
   promete `strip_metadata=True`, pero ese borrado solo se aplica al archivo
   que escribe, y con `write_noop=False` no escribe nada cuando no hay logo. En
   la muestra real 24 de 24 imagenes traian C2PA y solo 2 traian logo: encadenar
   el borrado al paso visible lo habria dejado intacto en el 92 % de los casos.

2. Se trabaja sobre una COPIA en carpeta escribible. `remove_video_all` crea su
   temporal junto al archivo de origen, asi que un directorio de solo lectura lo
   mata con `Errno 30`.
"""

from __future__ import annotations

import shutil
import time
from pathlib import Path
from typing import Any

from app.marcas import decidir_marca
from app.informe import (
    InformeLimpieza,
    InformeMetadatos,
    MarcaVisible,
    decidir_estado,
)

# Alto de la miniatura que ya usa la galeria (ver `scripts/regen-thumbs-900.mjs`).
MINIATURA_ANCHO_MAX = 900
MINIATURA_CALIDAD = 82

# El motor solo declara SDR de 8 bits en la ruta de pixeles de video; un HDR o
# un 10 bits se rechaza antes de tocar nada, en vez de degradarlo en silencio.
MOTIVO_HDR = "hdr_no_soportado"


def _version_motor() -> str:
    import remove_ai_watermarks

    return getattr(remove_ai_watermarks, "__version__", "desconocida")


def _marca_desde_motor(resultado: Any) -> MarcaVisible:
    """Traduce un `MarkRemovalResult` del motor a nuestro contrato."""
    # `status` es un Literal del motor: 'cleaned' | 'partial' | 'unvalidated'.
    # 'partial' significa que el detector sigue aceptando una region que se
    # relleno; 'unvalidated' que la comprobacion no pudo correr.
    bruto = str(getattr(resultado, "status", "") or "")
    if bruto == "partial":
        estado = "persiste"
    elif bruto in {"unvalidated", ""}:
        estado = "sin_validar"
    else:
        estado = "removida"
    despues = getattr(resultado, "confidence_after", None)
    return MarcaVisible(
        etiqueta=str(getattr(resultado, "label", None) or getattr(resultado, "key", "?")),
        confianzaAntes=float(getattr(resultado, "confidence_before", 0.0) or 0.0),
        confianzaDespues=float(despues if despues is not None else 0.0),
        estado=estado,  # type: ignore[arg-type]
    )


def _escribir_miniatura(origen: Path, destino: Path) -> bool:
    """Miniatura JPEG del objeto limpio. Un fallo aqui no invalida la limpieza."""
    try:
        import cv2

        imagen = cv2.imread(str(origen), cv2.IMREAD_COLOR)
        if imagen is None:
            return False
        alto, ancho = imagen.shape[:2]
        if ancho > MINIATURA_ANCHO_MAX:
            escala = MINIATURA_ANCHO_MAX / ancho
            imagen = cv2.resize(
                imagen,
                (MINIATURA_ANCHO_MAX, max(1, int(alto * escala))),
                interpolation=cv2.INTER_AREA,
            )
        destino.parent.mkdir(parents=True, exist_ok=True)
        return bool(
            cv2.imwrite(str(destino), imagen, [cv2.IMWRITE_JPEG_QUALITY, MINIATURA_CALIDAD])
        )
    except Exception as err:  # noqa: BLE001 - se informa, nunca tumba el trabajo
        print(f"[limpieza] miniatura fallida para {origen.name}: {err}", flush=True)
        return False


def limpiar_imagen(
    origen: Path,
    carpeta_trabajo: Path,
    backend: str = "migan",
    sensibilidad: str = "auto",
    miniatura: Path | None = None,
    proveedor: str | None = None,
) -> tuple[InformeLimpieza, Path | None]:
    """Devuelve (informe, ruta del archivo limpio o None si no habia nada)."""
    import remove_ai_watermarks as raiw
    from remove_ai_watermarks import metadata as meta_mod

    inicio = time.monotonic()
    carpeta_trabajo.mkdir(parents=True, exist_ok=True)
    trabajo = carpeta_trabajo / origen.name
    if trabajo != origen:
        shutil.copy2(origen, trabajo)

    # --- Paso 1: el logo. `write_noop=False` evita copiar el archivo cuando no
    # hay marca; asi `tras_visible.exists()` responde "hubo logo" sin ambiguedad.
    tras_visible = carpeta_trabajo / f"{origen.stem}.v{origen.suffix}"
    visibles: list[MarcaVisible] = []
    decision = decidir_marca(proveedor, es_video=False)
    if decision.saltar:
        # Motor medido sin logo: no se escanea. Ahorra una pasada de detector
        # por imagen y, sobre todo, cierra la puerta a un falso positivo que
        # rellenaria pixeles buenos.
        print(f"[limpieza] {origen.name}: {proveedor} no estampa logo, se salta el paso visible", flush=True)
    else:
        try:
            reporte = raiw.remove_visible_detailed(
                trabajo,
                tras_visible,
                sensitivity=sensibilidad,  # type: ignore[arg-type]
                backend=backend,  # type: ignore[arg-type]
                strip_metadata=False,  # lo hace el paso 2, siempre
                write_noop=False,
            )
            visibles = [_marca_desde_motor(m) for m in reporte.marks]
        except Exception as err:  # noqa: BLE001
            # Un fallo del inpainting NO cancela el borrado de metadatos, que es
            # la capa que de verdad quita la etiqueta "Hecho con IA" de las redes.
            print(f"[limpieza] paso visible fallido en {origen.name}: {err}", flush=True)

    hubo_logo = tras_visible.exists() and tras_visible.stat().st_size > 0
    entrada_meta = tras_visible if hubo_logo else trabajo

    # --- Paso 2: los metadatos. Siempre.
    #
    # La inspeccion va sobre el ORIGINAL, no sobre el intermedio: el paso
    # visible recodifica la imagen y de paso se lleva el C2PA, asi que
    # preguntarle al intermedio contestaria "no habia metadatos" justo en los
    # archivos que si los traian (medido el 2026-09-20 con una imagen de Gemini
    # cuyo `identify` declaraba C2PA de Google). El informe tiene que describir
    # el archivo que llego, no el que dejo el paso anterior — y de ese informe
    # depende si se cobra.
    tenia_meta = False
    try:
        tenia_meta = meta_mod.has_ai_metadata(trabajo)
    except Exception as err:  # noqa: BLE001
        print(f"[limpieza] inspeccion de metadatos fallida en {origen.name}: {err}", flush=True)

    final = carpeta_trabajo / f"{origen.stem}.limpio{origen.suffix}"
    sobrevivientes: dict[str, str] = {}
    escribio_meta = False
    try:
        # `strip_and_verify` relee el archivo escrito y devuelve lo que
        # sobrevivio: es la verificacion, no hace falta una segunda pasada.
        _, sobrevivientes = meta_mod.strip_and_verify(entrada_meta, final)
        escribio_meta = final.exists() and final.stat().st_size > 0
    except Exception as err:  # noqa: BLE001
        print(f"[limpieza] borrado de metadatos fallido en {origen.name}: {err}", flush=True)

    metadatos = InformeMetadatos(
        encontrados=["ai_metadata"] if tenia_meta else [],
        removidos=["ai_metadata"] if (tenia_meta and not sobrevivientes) else [],
        sobrevivientes=sorted(sobrevivientes),
    )

    # Solo se publica salida si se quito algo: ni el logo ni los metadatos
    # cambiaron nada => se conserva el original y no se cobra.
    hay_cambio = hubo_logo or tenia_meta
    salida = final if (hay_cambio and escribio_meta) else None

    escribio_mini = False
    if salida is not None and miniatura is not None:
        escribio_mini = _escribir_miniatura(salida, miniatura)

    informe = InformeLimpieza(
        estado=decidir_estado(visibles, metadatos, escribio_salida=salida is not None),
        visibles=visibles,
        metadatos=metadatos,
        backend=backend,
        versionMotor=_version_motor(),
        duracionMs=int((time.monotonic() - inicio) * 1000),
        escribioSalida=salida is not None,
        escribioMiniatura=escribio_mini,
        bytesEntrada=origen.stat().st_size,
        bytesSalida=salida.stat().st_size if salida else 0,
    )
    return informe, salida


def limpiar_video(
    origen: Path,
    carpeta_trabajo: Path,
    backend: str = "migan",
    proveedor: str | None = None,
) -> tuple[InformeLimpieza, Path | None]:
    """Igual que `limpiar_imagen` pero por la ruta de video del motor.

    `remove_video_all` ya borra los metadatos aunque no encuentre logo (medido),
    asi que aqui no hace falta el segundo paso: su `remaining_metadata` es la
    verificacion.
    """
    import remove_ai_watermarks as raiw

    inicio = time.monotonic()
    carpeta_trabajo.mkdir(parents=True, exist_ok=True)
    trabajo = carpeta_trabajo / origen.name
    if trabajo != origen:
        shutil.copy2(origen, trabajo)
    final = carpeta_trabajo / f"{origen.stem}.limpio{origen.suffix}"

    decision = decidir_marca(proveedor, es_video=True)
    try:
        # `mark` restringe el escaneo a la marca del proveedor. Con `auto`,
        # la silueta de Kling daba falso positivo en videos de MiniMax y
        # recodificaba el archivo entero para nada (medido el 2026-09-20).
        resultado = raiw.remove_video_all(
            trabajo, final, backend=backend, mark=decision.marca
        )
    except Exception as err:  # noqa: BLE001
        texto = str(err)
        # El motor rechaza HDR/10 bits antes de codificar. Es un desenlace
        # legitimo, no una averia: se informa con su motivo y no se reintenta.
        es_hdr = "HDR" in texto or "bit depth" in texto or "PQ" in texto or "HLG" in texto
        return (
            InformeLimpieza(
                estado="rejected",
                visibles=[],
                metadatos=InformeMetadatos(),
                backend=backend,
                versionMotor=_version_motor(),
                duracionMs=int((time.monotonic() - inicio) * 1000),
                escribioSalida=False,
                escribioMiniatura=False,
                motivo=MOTIVO_HDR if es_hdr else texto[:200],
                bytesEntrada=origen.stat().st_size,
            ),
            None,
        )

    detectados = dict(getattr(resultado, "detected_metadata", {}) or {})
    restantes = dict(getattr(resultado, "remaining_metadata", {}) or {})
    marca = getattr(resultado, "visible_mark", None)
    cuadros_quitados = int(getattr(resultado, "visible_removed_frames", 0) or 0)

    visibles: list[MarcaVisible] = []
    if marca:
        visibles.append(
            MarcaVisible(
                etiqueta=str(marca),
                confianzaAntes=1.0,
                confianzaDespues=0.0 if cuadros_quitados else 1.0,
                estado="removida" if cuadros_quitados else "persiste",
            )
        )

    metadatos = InformeMetadatos(
        encontrados=sorted(detectados),
        removidos=sorted(set(detectados) - set(restantes)),
        sobrevivientes=sorted(restantes),
    )

    # `video all` SIEMPRE escribe (aunque sea un pase sin cambios), asi que la
    # salida solo se publica si de verdad se quito algo. Si no, la fila conserva
    # el original y no se cobra.
    hay_cambio = bool(marca and cuadros_quitados) or bool(metadatos.removidos)
    salida = final if (hay_cambio and final.exists() and final.stat().st_size > 0) else None

    return (
        InformeLimpieza(
            estado=decidir_estado(visibles, metadatos, escribio_salida=salida is not None),
            visibles=visibles,
            metadatos=metadatos,
            backend=backend,
            versionMotor=_version_motor(),
            duracionMs=int((time.monotonic() - inicio) * 1000),
            escribioSalida=salida is not None,
            escribioMiniatura=False,
            bytesEntrada=origen.stat().st_size,
            bytesSalida=salida.stat().st_size if salida else 0,
        ),
        salida,
    )
