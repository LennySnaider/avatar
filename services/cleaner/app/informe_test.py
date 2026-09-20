"""Pruebas del mapeo puro. `python3 -m pytest app/informe_test.py` dentro del contenedor."""

from __future__ import annotations

from app.informe import InformeMetadatos, MarcaVisible, decidir_estado

SIN_META = InformeMetadatos()


def marca(estado: str) -> MarcaVisible:
    return MarcaVisible(etiqueta="gemini", confianzaAntes=0.9, confianzaDespues=0.0, estado=estado)  # type: ignore[arg-type]


def test_sin_salida_es_no_marks() -> None:
    # Aunque el detector dijera algo: si no se escribio, no se toco nada.
    assert decidir_estado([marca("removida")], SIN_META, escribio_salida=False) == "no_marks"


def test_logo_removido_es_cleaned() -> None:
    assert decidir_estado([marca("removida")], SIN_META, escribio_salida=True) == "cleaned"


def test_solo_metadatos_tambien_es_cleaned() -> None:
    meta = InformeMetadatos(encontrados=["c2pa"], removidos=["c2pa"])
    assert decidir_estado([], meta, escribio_salida=True) == "cleaned"


def test_marca_que_persiste_baja_a_partial() -> None:
    assert decidir_estado([marca("persiste")], SIN_META, escribio_salida=True) == "partial"


def test_metadato_superviviente_baja_a_partial() -> None:
    meta = InformeMetadatos(encontrados=["c2pa"], removidos=["c2pa"], sobrevivientes=["xmp"])
    assert decidir_estado([], meta, escribio_salida=True) == "partial"


def test_sin_validar_no_cuenta_como_persiste() -> None:
    # `sin_validar` es "no pude confirmar", no "sigue ahi".
    assert decidir_estado([marca("sin_validar")], SIN_META, escribio_salida=True) == "cleaned"


def test_salida_sin_nada_removido_no_se_declara_limpia() -> None:
    # De esto depende que no se cobre por una limpieza que no quito nada.
    assert decidir_estado([], SIN_META, escribio_salida=True) == "no_marks"
