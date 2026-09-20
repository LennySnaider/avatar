"""Descarga y subida por URL prefirmada. Sin credenciales de R2 en el servicio.

POR QUE URLS PREFIRMADAS Y NO LAS LLAVES: este contenedor procesa archivos de
todas las organizaciones. Con las llaves de R2 dentro, un fallo suyo alcanzaria
el bucket entero; con URLs prefirmadas solo puede leer y escribir los dos
objetos concretos que Next.js le autorizo, y solo durante su ventana.

Tambien resuelve el limite de 4,5 MB de cuerpo de peticion de Vercel: ni la
peticion ni la respuesta llevan bytes de medios.
"""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

import httpx

# Tope de descarga. Un archivo mas grande se rechaza antes de ocupar el disco
# del contenedor; los videos de la plataforma no pasan de decenas de MB.
MAX_BYTES_ORIGEN = int(os.environ.get("CLEANER_MAX_SOURCE_BYTES", 200 * 1024 * 1024))

# Tamano de trozo al leer: suficiente para no hacer miles de llamadas y
# pequeno para cortar pronto si el archivo se pasa del tope.
TROZO = 1024 * 1024


class OrigenDemasiadoGrande(Exception):
    """El archivo supera `MAX_BYTES_ORIGEN`."""


class HostNoPermitido(Exception):
    """La URL apunta a un host fuera de la lista blanca."""


def _hosts_permitidos() -> list[str]:
    crudo = os.environ.get("ALLOWED_URL_HOSTS", "")
    return [h.strip().lower() for h in crudo.split(",") if h.strip()]


def validar_host(url: str) -> None:
    """Rechaza URLs fuera de la lista blanca.

    Sin esto, cualquiera que alcance el servicio podria usarlo como proxy para
    leer direcciones internas de la red (SSRF). La lista se configura por
    entorno porque el dominio publico de R2 cambia con el bucket.
    """
    permitidos = _hosts_permitidos()
    if not permitidos:
        # Sin lista configurada no se adivina: se bloquea. Un fallo de
        # configuracion no debe convertirse en un agujero abierto.
        raise HostNoPermitido("ALLOWED_URL_HOSTS no esta configurado")
    host = (urlparse(url).hostname or "").lower()
    for patron in permitidos:
        if patron.startswith("*."):
            if host.endswith(patron[1:]):
                return
        elif host == patron:
            return
    raise HostNoPermitido(f"host no permitido: {host or '(vacio)'}")


async def descargar(url: str, destino: Path, *, timeout_s: float = 120.0) -> int:
    """Descarga a disco por trozos. Devuelve los bytes escritos."""
    validar_host(url)
    destino.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    async with httpx.AsyncClient(timeout=timeout_s, follow_redirects=False) as cliente:
        async with cliente.stream("GET", url) as respuesta:
            respuesta.raise_for_status()
            # Si el servidor declara el tamano, se corta antes de descargar.
            declarado = respuesta.headers.get("content-length")
            if declarado and int(declarado) > MAX_BYTES_ORIGEN:
                raise OrigenDemasiadoGrande(f"{declarado} bytes > {MAX_BYTES_ORIGEN}")
            with destino.open("wb") as salida:
                async for trozo in respuesta.aiter_bytes(TROZO):
                    total += len(trozo)
                    if total > MAX_BYTES_ORIGEN:
                        salida.close()
                        destino.unlink(missing_ok=True)
                        raise OrigenDemasiadoGrande(f"mas de {MAX_BYTES_ORIGEN} bytes")
                    salida.write(trozo)
    return total


async def subir(
    url: str,
    origen: Path,
    *,
    content_type: str,
    cache_control: str | None = None,
    timeout_s: float = 120.0,
) -> None:
    """Sube por PUT prefirmado.

    Las cabeceras van tal cual las manda Next.js: la firma de R2 cubre solo el
    `host`, asi que `Content-Type` y `Cache-Control` viajan como cabeceras
    normales, igual que hace `src/lib/storageUpload.ts` en el navegador.
    """
    validar_host(url)
    cabeceras = {"Content-Type": content_type}
    if cache_control:
        cabeceras["Cache-Control"] = cache_control
    datos = origen.read_bytes()
    async with httpx.AsyncClient(timeout=timeout_s) as cliente:
        respuesta = await cliente.put(url, content=datos, headers=cabeceras)
        respuesta.raise_for_status()
