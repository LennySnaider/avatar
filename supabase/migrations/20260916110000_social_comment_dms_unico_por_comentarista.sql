-- La regla del plan es UN DM por comentarista y post, pero el unico indice
-- unico que trae social_comment_dms (20260916100000_social_comments_ia.sql)
-- es sobre comment_id: evita repetir el DM si el poller vuelve a ver el
-- MISMO comentario, pero no evita nada si el MISMO comentarista deja dos
-- comentarios distintos bajo el MISMO post y ambos se procesan en paralelo
-- (dos comment_id distintos, dos filas, dos DMs). Este indice cierra esa
-- carrera a nivel de base de datos: el segundo insert falla con
-- "duplicate key", que privateReply.ts ya trata como una carrera benigna
-- (el otro worker gano, el DM salio una sola vez).
create unique index if not exists uq_social_comment_dms_avatar_post_commenter
    on public.social_comment_dms (avatar_id, platform_post_id, commenter_id);

comment on index uq_social_comment_dms_avatar_post_commenter is
    'Un DM por (avatar, post, comentarista) -- la regla real del plan. comment_id unique (indice original) es un cinturon aparte para el reintento del mismo comentario, no evita dos comentarios distintos del mismo comentarista en el mismo post.';
