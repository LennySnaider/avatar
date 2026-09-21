-- Publicación partida por música: un mismo post puede necesitar DOS llamadas a
-- Upload-Post porque las plataformas quieren archivos distintos (TikTok el MP4
-- limpio + pista nativa; Instagram el MP4 con la música horneada). Upload-Post
-- manda un archivo por llamada, así que salen dos filas con su propio
-- upload_post_request_id cada una.
--
-- Se eligieron dos filas y no una con varios request_id porque el webhook ya
-- resuelve por upload_post_request_id y ya contempla que no sea único: así no
-- hay que tocar la correlación, que es la parte frágil. Esta columna sólo las
-- vuelve a juntar de cara a la UI.
alter table social_posts add column if not exists post_group_id uuid;

create index if not exists idx_social_posts_post_group_id
    on social_posts(post_group_id)
    where post_group_id is not null;

comment on column social_posts.post_group_id is
    'Agrupa las filas de un mismo post del usuario que se publicó en varias llamadas a Upload-Post (una por archivo: MP4 limpio para TikTok con pista nativa, MP4 con música horneada para el resto). NULL en los posts de una sola llamada, que son la mayoría.';
