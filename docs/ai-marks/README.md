# Limpieza de marcas de IA (`ai-mark-cleaner`)

Quita de cada imagen y vídeo generado las dos cosas que delatan que lo hizo una
IA y que sí se pueden quitar sin tocar la cara del avatar:

1. **El logo visible** del proveedor (el destello de Gemini, `KLING AI`, el
   diamante de Veo, la caja `AI` de Seedance, la etiqueta de Hailuo). Se
   localiza y se rellena sólo esa región.
2. **Las etiquetas invisibles**: C2PA/Content Credentials, EXIF, XMP, IPTC, las
   etiquetas TC260 chinas y las de los contenedores MP4. Son las que leen
   Instagram y TikTok para poner "Hecho con IA".

**Lo que NO hace**: SynthID, la huella que Google mezcla en todos los píxeles.
No se borra, sólo se puede repintar la imagen entera con otro modelo, lo que
exige una GPU grande y puede cambiar la cara. Ver [Futuro](#futuro-synthid).

> Quitar una señal local no prueba que el archivo sea humano, no borra el
> historial del proveedor ni anonimiza la cuenta que lo generó. El módulo es
> para contenido propio del tenant.

## Por qué existe

El removedor anterior pedía a Gemini la caja del destello y **pegaba un
rectángulo de color plano** con sharp, sólo sobre referencias de cara y ángulo.
En una foto real deja un cuadrado visible, y nunca tocó los metadatos: los
bytes de KIE, Kling, MiniMax y Veo llegaban a R2 tal cual, así que el C2PA del
proveedor viajaba intacto hasta la descarga y la publicación.

## Arquitectura: limpiar al registrar

```
navegador sube el original ──► R2 org/o/images/1726.png
                                      │
                                      ▼
                            apiSaveGeneration
                            inserta la fila con ai_marks_status='pending'
                                      │
                                      ▼
                            GET prefirmado ──► servicio Python ──► PUT prefirmado
                                                                   org/o/images/1726.clean.png
                                      │
                                      ▼
                            UPDATE storage_path = ruta limpia
                                   ai_marks_status = cleaned | partial | no_marks
                            + cobro (sólo si se quitó algo)
                                      │
                                      ▼
                            el barrido borra el original ≥1 h después
```

**Por qué en el insert de la fila y no antes**: en el camino principal los bytes
nunca pasan por el servidor. `persistGeneration` los descarga en el navegador y
los sube por ticket prefirmado; el único punto por donde pasa el 100 % de las
generaciones es el insert en `generations` (tres sitios: `apiSaveGeneration`, el
rescate de tareas KIE y la reconciliación).

**Por qué una ruta nueva y no sobrescribir**: los objetos se suben con caché
inmutable, así que la CDN serviría el original durante un año aunque el byte
hubiera cambiado.

**Por qué una columna y no `metadata`**: `apiUpdateGenerationMetadata` reescribe
ese JSON entero desde la copia del cliente cada vez que alguien marca un
favorito. Un vídeo que termina de limpiarse 90 s después quedaría pisado por el
siguiente clic.

## Estados

| Estado | Qué significa | ¿Se cobra? |
|---|---|---|
| `none` | Generación anterior a la función | no |
| `skipped` | Módulo o ajuste apagado, formato no soportado, no está en R2 | no |
| `pending` | Encolada | no |
| `running` | Tomada por un trabajador | no |
| `cleaned` | Se quitó algo; el limpio es el que se sirve | **sí** |
| `partial` | Se escribió el limpio pero algo sobrevivió | sí, si quitó algo |
| `no_marks` | No había nada que quitar; se queda el original | no |
| `failed` | Agotados los tres intentos; se sirve el original | no |

Un `pending` de más de 10 minutos se presenta como fallo reintentable en vez de
un "limpiando…" eterno.

## El servicio

Contenedor Python (`services/cleaner`) con el motor `remove-ai-watermarks`
0.41.1, ffmpeg y los pesos de MI-GAN horneados en la imagen.

- `GET /health` → versión del motor, si el modelo está cargado, ocupación.
- `POST /v1/clean` → recibe dos URLs prefirmadas y devuelve un informe.

**Ni la petición ni la respuesta llevan bytes.** Así el límite de 4,5 MB de
cuerpo de Vercel deja de importar y el contenedor nunca necesita las llaves de
R2: sólo puede tocar los dos objetos que Next.js le autorizó.

Autenticación por cabecera `X-Cleaner-Secret` y lista blanca de hosts
(`ALLOWED_URL_HOSTS`) que cierra el SSRF. Sin lista configurada se bloquea todo:
un fallo de configuración no debe convertirse en un proxy abierto.

### Variables de entorno

| Variable | Dónde | Para qué |
|---|---|---|
| `AI_MARKS_CLEANER_URL` | Next.js | Base del servicio (la inyecta el binding de Vercel Services) |
| `AI_MARKS_CLEANER_SECRET` | Next.js | Secreto compartido |
| `CLEANER_SECRET` | servicio | El mismo secreto, del otro lado |
| `ALLOWED_URL_HOSTS` | servicio | Hosts permitidos, separados por coma; acepta `*.dominio` |
| `CLEANER_MAX_CONCURRENCY` | servicio | Trabajos simultáneos (2 por defecto: 2 vCPU) |
| `CLEANER_MAX_SOURCE_BYTES` | servicio | Tope de descarga (200 MB por defecto) |

### Desarrollo local

```bash
docker build -t aimarks-cleaner:dev -f services/cleaner/Dockerfile.vercel services/cleaner
docker run --rm -p 8788:80 \
  -e CLEANER_SECRET=dev \
  -e ALLOWED_URL_HOSTS='host.docker.internal' \
  aimarks-cleaner:dev
curl -s localhost:8788/health
```

En `.env.local`: `AI_MARKS_CLEANER_URL=http://localhost:8788` y
`AI_MARKS_CLEANER_SECRET=dev`.

## Decisiones que salieron de medir

Todas verificadas el 2026-09-20 sobre generaciones reales de R2. El detalle está
en [el informe del spike](./spike-2026-09-20.md).

**El borrado de metadatos es un paso propio y siempre corre.** El comando
`visible` promete borrarlos, pero sólo los borra del archivo que escribe, y no
escribe nada cuando no encuentra logo. En la muestra real casi ninguna imagen
trae logo y casi todas traen C2PA: encadenar el borrado al paso visible lo
habría dejado intacto justo en el caso común.

**Al motor se le pasa el proveedor que ya conocemos.** Con detección automática
prueba las siete marcas de vídeo y se queda con la primera que encaje; en dos
vídeos de MiniMax Hailuo la silueta de Kling encajó en los 141 fotogramas sobre
una pierna y el marco de una puerta. El mismo archivo, sólo cambiando eso:

| Detección | Resultado | Tiempo |
|---|---|---|
| automática | "limpiado", marca kling removida, vídeo reescrito | 115,6 s |
| con el proveedor | "no hay marcas", nada escrito | 3,25 s |

**Los pesos van horneados en la imagen.** Sin eso, el primer borrado de cada
contenedor nuevo va a Hugging Face y tarda 8,2 s en vez de 2,2 s. Con
`HF_HUB_OFFLINE=1` el contenedor funciona sin red.

**La inspección de metadatos va sobre el original.** El paso visible recodifica
la imagen y de paso se lleva el C2PA, así que preguntarle al archivo intermedio
contestaba "no había metadatos" justo en los que sí los traían. De ese informe
depende si se cobra.

**El valor está en los metadatos, no en los logos.** De 118 generaciones reales,
91 traían una etiqueta invisible y sólo 5 traían un logo visible. El tamaño del
archivo no crece salvo cuando hay que rellenar píxeles (mediana 0,99×), así que
el efecto sobre el almacenamiento es despreciable.

## Cobro

Módulo instalable, cuota mensual 0, cobro por uso. **Sólo se cobra cuando el
archivo salió distinto de como entró**: mirar cuesta milisegundos y cobrar por
"no había nada" produce la factura que el tenant no entiende. Un `failed`
tampoco se cobra, porque el tenant se queda con el archivo sucio.

Precios derivados del coste medido con el margen de 3× del catálogo:

| Operación | Coste medido | Tokens |
|---|---|---|
| Imagen | 0,00021 USD | 1 |
| Vídeo sin relleno | 0,00030 USD | 1 |
| Vídeo con relleno fotograma a fotograma | 0,00670 USD | 21 |

## Futuro: SynthID

La capa invisible existe en el motor pero está fuera de esta versión.

- **Dónde correría**: GPU alquilada por segundo (Modal, A100 de 80 GB, 2,50
  USD/hora → unos 0,0017 USD por imagen). Las tarjetas de 24-32 GB no valen: el
  pase pasa de 2,2 s a 37 s en modo streaming.
- **Qué hay que medir antes**: la regeneración repinta la imagen entera y puede
  cambiar la cara. Hace falta un spike de menos de 5 USD con dos avatares
  reales, midiendo parecido facial contra el original.
- **En vídeo está descartado**: el perfil certificado entrega 512×288 a 12 fps.
- **Encaje previsto**: la fila "SynthID (próximamente)" del cajón de ajustes y
  el transporte de sondeo del cliente ya están contemplados.
