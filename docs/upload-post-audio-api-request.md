# Feature request para Upload-Post: Instagram Audio API

Texto listo para enviar a soporte de Upload-Post. El objetivo es que expongan
la Audio API de Meta para que Instagram pueda recibir una pista **adjunta**,
igual que TikTok ya recibe la suya con `tiktok_music_id`.

Mientras no exista, la música en Instagram tiene que ir **horneada** en el MP4
(ver `AudioMuxService`), lo que funciona pero no da página de sonido y expone
a que una pista con copyright acabe muteada.

---

## Mensaje

> **Subject:** Instagram Reels — support for Meta's Audio API (`audio_configuration`)
>
> Hi,
>
> We publish Reels through your `/api/upload` endpoint and we would like to
> attach official Instagram audio to them, the same way your
> `tiktok_music_id` parameter already lets us attach a track from TikTok's
> Commercial Music Library. That TikTok support works well for us — we are
> asking for the Instagram equivalent.
>
> Meta exposes this in the Instagram Audio API:
> https://developers.facebook.com/docs/instagram-platform/content-publishing/audio-api/
>
> Two pieces would cover our use case:
>
> 1. **Audio discovery** — a passthrough for `GET /ig_audio`, which searches
>    Instagram audio by `audio_type` (`music` or `original_sound`) and returns
>    an `audio_id`.
> 2. **Attachment on publish** — an `audio_configuration` object on
>    `POST /api/upload` for Instagram Reels, carrying `audio_id`,
>    `audio_volume` and `video_volume`, which Meta accepts when creating the
>    media container.
>
> Today the only Instagram audio field we can see in your API is `audio_name`,
> which labels a track already embedded in the video rather than attaching a
> real one. That means our Reels cannot appear on a sound's page, and a
> licensed track baked into the file risks being muted.
>
> Could you tell us whether this is a technical blocker on your side or a
> roadmap item, and if there is a timeline we could plan around? We are also
> happy to test it behind a flag if that helps.
>
> Thanks,

---

## Contexto interno (no enviar)

- Meta exige **Instagram API con Facebook Login** (no Instagram Login) y app
  review de `instagram_content_publish`. Si Upload-Post ya opera con Facebook
  Login, el trabajo es suyo y no nuestro — de ahí la pregunta sobre si el
  bloqueo es técnico o de roadmap.
- **Dato pendiente de confirmar por nuestra parte:** si las cuentas de
  Instagram de los avatares son *Business* o *Creator*. Las Business sólo
  acceden a la Meta Sound Collection (royalty-free acotada); el catálogo
  licenciado completo es de Creator.
  https://www.facebook.com/business/help/402084904469945
  Esto decide cuánto vale la pena insistir.
- Si aceptan, Instagram se sube al mismo diseño que ya usa TikTok
  (`planMusicDispatch`): sólo habría que añadir el parámetro en
  `UploadPostProvider`; la publicación partida ya está resuelta.
