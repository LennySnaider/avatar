-- Fotos gratis en Telegram: el catálogo admite ítems que se regalan (teaser)
-- además de los de pago. Es la misma tabla, no una paralela: is_free decide
-- el camino (deliverFreeMedia vs deliverPaidMedia) y el motor de oferta.
alter table telegram_paid_media_items
    add column if not exists is_free boolean not null default false,
    add column if not exists free_sends_count int not null default 0;

comment on column telegram_paid_media_items.is_free is
    'El ítem se regala (teaser): se envía con sendPhoto/sendVideo sin cobro, una sola vez por fan, sin protect_content. false = contenido de pago en Stars.';
comment on column telegram_paid_media_items.free_sends_count is
    'Veces que se ha regalado este ítem. Equivalente de offers_count pero para gratis.';

-- El precio en Stars solo tiene sentido si el ítem es de pago: 0 exclusivo
-- para gratis, 1..25000 (límite de la Bot API) para el resto.
alter table telegram_paid_media_items
    drop constraint if exists telegram_paid_media_items_star_price_check;
alter table telegram_paid_media_items
    add constraint telegram_paid_media_items_star_price_check
    check ((is_free and star_price = 0) or (not is_free and star_price between 1 and 25000));
