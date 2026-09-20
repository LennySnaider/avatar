"""Servicio HTTP del limpiador de marcas de IA.

Contrato: ni la peticion ni la respuesta llevan bytes de medios. Next.js manda
dos URLs prefirmadas (una GET del original, una PUT del limpio) y recibe un
informe. Asi el limite de 4,5 MB de cuerpo de Vercel deja de importar y el
servicio nunca necesita las llaves de R2.

Autenticacion: cabecera `X-Cleaner-Secret`. El binding de Vercel Services hace
que el servicio no sea alcanzable desde internet, pero un binding concede
alcance, no identidad: el secreto sigue siendo necesario.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import shutil
import tempfile
from dataclasses import asdict
from pathlib import Path
from typing import Any, Literal

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app import almacen
from app.limpieza import limpiar_imagen, limpiar_video

# Cuantos trabajos a la vez. El contenedor de Vercel tiene 2 vCPU y 4 GB;
# MI-GAN pide ~950 MB de pico, asi que dos caben y tres se pelearian por la CPU
# alargando los dos que ya corrian.
MAX_CONCURRENCIA = int(os.environ.get("CLEANER_MAX_CONCURRENCY", "2"))

_semaforo = asyncio.Semaphore(MAX_CONCURRENCIA)
_estado: dict[str, Any] = {"modeloCargado": False, "ocupados": 0}


class Origen(BaseModel):
    getUrl: str


class Salida(BaseModel):
    putUrl: str
    contentType: str
    cacheControl: str | None = None


class Miniatura(BaseModel):
    putUrl: str
    contentType: str = "image/jpeg"
    cacheControl: str | None = None


class Opciones(BaseModel):
    backend: Literal["cv2", "migan", "lama"] = "migan"
    sensibilidad: Literal["auto", "strict"] = "auto"
    # Sólo para trazas del lado servidor: el motor decide por su cuenta.
    proveedor: str | None = None
    modelo: str | None = None


class PeticionLimpieza(BaseModel):
    jobId: str = Field(min_length=1, max_length=128)
    mediaType: Literal["image", "video"]
    source: Origen
    output: Salida
    thumbnail: Miniatura | None = None
    options: Opciones = Field(default_factory=Opciones)


def _verificar_secreto(recibido: str | None) -> None:
    esperado = os.environ.get("CLEANER_SECRET", "")
    if not esperado:
        # Sin secreto configurado el servicio no arranca su ruta de trabajo: es
        # preferible un 500 a las claras que un endpoint abierto.
        raise HTTPException(status_code=500, detail="CLEANER_SECRET no configurado")
    if recibido != esperado:
        raise HTTPException(status_code=401, detail="secreto invalido")


@contextlib.asynccontextmanager
async def ciclo_de_vida(_: FastAPI):
    """Crea la sesion ONNX antes de la primera peticion de un usuario."""
    try:
        from app.warmup import calentar

        await asyncio.to_thread(calentar)
        _estado["modeloCargado"] = True
    except Exception as err:  # noqa: BLE001
        # Arrancar sin modelo se PERMITE pero se grita: `/health` lo dira y el
        # barrido de Next.js dejara de mandar trabajo en vez de quemar intentos.
        print(f"[cleaner] ARRANQUE SIN MODELO: {err}", flush=True)
        _estado["modeloCargado"] = False
    yield


app = FastAPI(title="Limpiador de marcas de IA", lifespan=ciclo_de_vida)


@app.get("/health")
async def salud() -> dict[str, Any]:
    import remove_ai_watermarks

    return {
        "ok": True,
        "versionMotor": getattr(remove_ai_watermarks, "__version__", "desconocida"),
        "backend": "migan",
        "modeloCargado": _estado["modeloCargado"],
        "ffmpeg": shutil.which("ffmpeg") is not None,
        "ocupados": _estado["ocupados"],
        "maxConcurrencia": MAX_CONCURRENCIA,
    }


@app.post("/v1/clean")
async def limpiar(
    peticion: PeticionLimpieza,
    _solicitud: Request,
    x_cleaner_secret: str | None = Header(default=None),
) -> JSONResponse:
    _verificar_secreto(x_cleaner_secret)

    if _semaforo.locked() and _estado["ocupados"] >= MAX_CONCURRENCIA:
        # 429 explicito: quien llama sabe que debe reintentar, no que algo se
        # rompio. Un 500 aqui haria que Next.js gastase uno de sus tres intentos.
        return JSONResponse(status_code=429, content={"error": "ocupado"})

    async with _semaforo:
        _estado["ocupados"] += 1
        try:
            return await _procesar(peticion)
        finally:
            _estado["ocupados"] -= 1


async def _procesar(peticion: PeticionLimpieza) -> JSONResponse:
    es_video = peticion.mediaType == "video"
    sufijo = ".mp4" if es_video else ".png"

    with tempfile.TemporaryDirectory(prefix="aimarks-") as tmp:
        carpeta = Path(tmp)
        origen = carpeta / f"entrada{sufijo}"
        try:
            await almacen.descargar(peticion.source.getUrl, origen)
        except almacen.HostNoPermitido as err:
            raise HTTPException(status_code=400, detail=str(err)) from err
        except almacen.OrigenDemasiadoGrande as err:
            raise HTTPException(status_code=413, detail=str(err)) from err
        except httpx.HTTPError as err:
            # 502: el fallo es de la descarga, no del motor. Next.js lo
            # reintenta igual, pero el log dice donde se rompio.
            raise HTTPException(status_code=502, detail=f"descarga: {err}") from err

        trabajo = carpeta / "trabajo"
        ruta_miniatura = carpeta / "miniatura.jpg" if peticion.thumbnail else None

        # El motor es sincrono y usa CPU: va a un hilo para no bloquear el bucle
        # de eventos y poder atender `/health` mientras tanto.
        if es_video:
            informe, salida = await asyncio.to_thread(
                limpiar_video,
                origen,
                trabajo,
                peticion.options.backend,
                peticion.options.proveedor,
            )
        else:
            informe, salida = await asyncio.to_thread(
                limpiar_imagen,
                origen,
                trabajo,
                peticion.options.backend,
                peticion.options.sensibilidad,
                ruta_miniatura,
                peticion.options.proveedor,
            )

        if salida is not None:
            try:
                await almacen.subir(
                    peticion.output.putUrl,
                    salida,
                    content_type=peticion.output.contentType,
                    cache_control=peticion.output.cacheControl,
                )
            except httpx.HTTPError as err:
                raise HTTPException(status_code=502, detail=f"subida: {err}") from err

            if (
                peticion.thumbnail
                and ruta_miniatura is not None
                and ruta_miniatura.exists()
            ):
                try:
                    await almacen.subir(
                        peticion.thumbnail.putUrl,
                        ruta_miniatura,
                        content_type=peticion.thumbnail.contentType,
                        cache_control=peticion.thumbnail.cacheControl,
                    )
                except httpx.HTTPError as err:
                    # La miniatura es accesoria: se informa y se sigue. Perder
                    # la limpieza por una miniatura seria desproporcionado.
                    print(
                        f"[cleaner] {peticion.jobId} miniatura no subida: {err}",
                        flush=True,
                    )
                    informe = type(informe)(**{**asdict(informe), "escribioMiniatura": False})

        return JSONResponse(content={"jobId": peticion.jobId, **informe.to_json()})
