"""Formas del contrato HTTP. Puro: sin red, sin motor, sin FastAPI.

Se separa de `limpieza.py` para poder probar el mapeo motor -> JSON sin cargar
OpenCV ni ffmpeg, y para que el lado TypeScript tenga un unico sitio donde leer
que campos existen.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

# El estado que viaja al cliente. `rejected` es un desenlace legitimo (por
# ejemplo un video HDR que el motor no toca a proposito), no una averia: por eso
# viaja en un 200 con estado propio y no como error HTTP.
EstadoLimpieza = Literal["cleaned", "partial", "no_marks", "rejected"]

# Como quedo cada marca visible. `sin_validar` = se relleno pero el detector no
# pudo confirmarlo; NO significa que siga ahi.
EstadoMarca = Literal["removida", "persiste", "sin_validar"]


@dataclass(frozen=True, slots=True)
class MarcaVisible:
    etiqueta: str
    confianzaAntes: float
    confianzaDespues: float
    estado: EstadoMarca


@dataclass(frozen=True, slots=True)
class InformeMetadatos:
    encontrados: list[str] = field(default_factory=list)
    removidos: list[str] = field(default_factory=list)
    # Lo que seguia ahi DESPUES de borrar. Vacio es el caso bueno; con algo
    # dentro el estado global baja a `partial`.
    sobrevivientes: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class InformeLimpieza:
    estado: EstadoLimpieza
    visibles: list[MarcaVisible]
    metadatos: InformeMetadatos
    backend: str
    versionMotor: str
    duracionMs: int
    # `False` cuando no habia nada que quitar: no se escribio ningun objeto y
    # quien llama conserva la ruta original.
    escribioSalida: bool
    escribioMiniatura: bool
    motivo: str | None = None
    bytesEntrada: int = 0
    bytesSalida: int = 0

    def to_json(self) -> dict[str, Any]:
        return asdict(self)


def decidir_estado(
    visibles: list[MarcaVisible],
    metadatos: InformeMetadatos,
    escribio_salida: bool,
) -> EstadoLimpieza:
    """Resume las dos capas en un estado.

    El orden importa: `partial` gana sobre `cleaned` porque la interfaz tiene
    que poder avisar al publicar. Y `no_marks` solo se declara cuando NO se
    escribio nada, para que nunca se diga "no habia marcas" sobre un archivo
    que si se modifico.
    """
    algo_persiste = any(m.estado == "persiste" for m in visibles) or bool(
        metadatos.sobrevivientes
    )
    algo_removido = any(m.estado != "persiste" for m in visibles) or bool(
        metadatos.removidos
    )
    if not escribio_salida:
        return "no_marks"
    if algo_persiste:
        return "partial"
    if algo_removido:
        return "cleaned"
    # Se escribio pero no se quito nada identificable: no se cobra, asi que se
    # informa como `no_marks` aunque haya salida.
    return "no_marks"
