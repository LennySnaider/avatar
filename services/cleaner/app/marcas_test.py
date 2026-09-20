"""Pruebas del mapa proveedor -> marca."""

from __future__ import annotations

from app.marcas import MARCAS_IMAGEN, MARCAS_VIDEO, POR_PROVEEDOR, decidir_marca


def test_proveedor_desconocido_mira_todo() -> None:
    d = decidir_marca("Motor Nuevo 9000", es_video=False)
    assert d.marca == "auto" and not d.saltar


def test_sin_proveedor_mira_todo() -> None:
    for vacio in (None, ""):
        d = decidir_marca(vacio, es_video=True)
        assert d.marca == "auto" and not d.saltar


def test_hailuo_pide_su_marca_y_no_kling() -> None:
    # El caso que motiva el fichero: con `auto`, la silueta de Kling daba
    # falso positivo en 141/141 fotogramas de un video de MiniMax.
    d = decidir_marca("MiniMax Hailuo 2.3", es_video=True)
    assert d.marca == "hailuo" and not d.saltar


def test_motor_sin_logo_salta_el_paso_visible() -> None:
    d = decidir_marca("Seedream 5.0 Pro · KIE", es_video=False)
    assert d.saltar


def test_gemini_pide_el_sparkle() -> None:
    d = decidir_marca("Gemini 3.1 Flash Lite Image", es_video=False)
    assert d.marca == "gemini" and not d.saltar


def test_marca_no_valida_para_el_tipo_cae_a_auto() -> None:
    # `gemini` no es una marca de video; pedirla al CLI seria un error.
    d = decidir_marca("Gemini 3.1 Flash Lite Image", es_video=True)
    assert d.marca == "auto" and not d.saltar


def test_todas_las_marcas_del_mapa_existen_en_el_motor() -> None:
    # Si el motor retira una clave, esta prueba lo dice antes que produccion.
    for proveedor, marca in POR_PROVEEDOR.items():
        if marca is None:
            continue
        assert marca in MARCAS_VIDEO | MARCAS_IMAGEN, f"{proveedor} -> {marca}"
