-- Trending-sounds chart (TikTok viral audio, à la tokchart). GLOBAL reference
-- data — NOT tenant-scoped. Populated by a daily cron via the Apify actor
-- `automation-lab/tiktok-trends-scraper`; the UI reads from here so browsing
-- costs nothing (only the once-a-day refresh hits Apify).
create table if not exists trending_sounds (
    id uuid primary key default gen_random_uuid(),
    source text not null default 'tiktok',
    country_code text not null default 'GLOBAL',   -- 'GLOBAL','US','MX','ES','GB','BR'...
    period int not null default 7,                 -- 7 / 30 / 120 days
    rank int not null,
    sound_id text,
    name text not null,
    author text,
    cover_url text,
    play_url text,                                 -- preview audio stream
    link_url text,                                 -- TikTok sound page (finish-in-app)
    video_count bigint,
    trend text,                                    -- 'rising' | 'falling' | 'stable'
    is_original boolean,
    fetched_at timestamptz not null default now(),
    unique (source, country_code, period, sound_id)
);
create index if not exists idx_trending_sounds_board
    on trending_sounds(source, country_code, period, rank);

alter table trending_sounds enable row level security;
