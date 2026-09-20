"""Pruebas de la lista blanca de hosts. No tocan la red."""

from __future__ import annotations

import os

import pytest

from app.almacen import HostNoPermitido, validar_host


def test_sin_lista_configurada_bloquea(monkeypatch: pytest.MonkeyPatch) -> None:
    # Un fallo de configuracion no puede abrir el proxy a cualquier destino.
    monkeypatch.delenv("ALLOWED_URL_HOSTS", raising=False)
    with pytest.raises(HostNoPermitido):
        validar_host("https://ejemplo.com/x.png")


def test_host_exacto(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALLOWED_URL_HOSTS", "pub-abc.r2.dev")
    validar_host("https://pub-abc.r2.dev/org/o1/images/1.png")
    with pytest.raises(HostNoPermitido):
        validar_host("https://otro.r2.dev/x.png")


def test_comodin_de_subdominio(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALLOWED_URL_HOSTS", "*.r2.cloudflarestorage.com")
    validar_host("https://cuenta123.r2.cloudflarestorage.com/bucket/x.png")
    with pytest.raises(HostNoPermitido):
        validar_host("https://r2.cloudflarestorage.com.malo.net/x.png")


def test_bloquea_direcciones_internas(monkeypatch: pytest.MonkeyPatch) -> None:
    # El caso que motiva la lista: usar el servicio como puerta a la red interna.
    monkeypatch.setenv("ALLOWED_URL_HOSTS", "*.r2.cloudflarestorage.com")
    for url in (
        "http://169.254.169.254/latest/meta-data/",
        "http://localhost:8787/health",
        "http://10.0.0.5/secreto",
    ):
        with pytest.raises(HostNoPermitido):
            validar_host(url)


def test_varios_hosts_separados_por_coma(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALLOWED_URL_HOSTS", "pub-abc.r2.dev, *.r2.cloudflarestorage.com")
    validar_host("https://pub-abc.r2.dev/x.png")
    validar_host("https://c.r2.cloudflarestorage.com/x.png")
