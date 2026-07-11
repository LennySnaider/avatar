-- FASE 1 del Agente IA: persona por avatar + knowledge base RAG (pgvector).
-- Embeddings: gemini-embedding-001 @ outputDimensionality 768, L2-normalized in app code.
create extension if not exists vector;

create table if not exists avatar_personas (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    avatar_id uuid not null references avatars(id) on delete cascade,
    enabled boolean not null default false,
    -- Manual override; when null the system prompt is compiled from the fields below.
    system_prompt text,
    backstory text,
    personality jsonb not null default '{}'::jsonb,   -- {traits:[], interests:[], quirks:[], emoji_usage:'low|medium|high'}
    writing_style text,
    boundaries text,                                   -- hard limits ("never ...")
    languages text[] not null default '{en}',
    chat_provider text not null default 'gemini' check (chat_provider in ('gemini','openrouter','kie')),
    chat_model text not null default 'gemini-2.5-flash',
    -- Per-avatar LLM API key. NULL -> env fallback (GEMINI_API_KEY / OPENROUTER_API_KEY / KIE_API_KEY).
    api_key text,
    response_tone text not null default 'flirty',
    response_objective text not null default 'engagement',
    response_length text not null default 'medium',
    nsfw_level text not null default 'suggestive',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (avatar_id)
);

create table if not exists avatar_knowledge (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    avatar_id uuid not null references avatars(id) on delete cascade,
    kind text not null default 'manual' check (kind in ('bio','lore','faq','media','post','manual')),
    title text,
    content text not null,
    embedding vector(768),
    metadata jsonb not null default '{}'::jsonb,
    source_ref text,                                   -- 'social_posts:<id>' | 'fanvue_posts:<id>' | 'generations:<id>'
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
-- Idempotent reindex: one row per external source per avatar. Full (non
-- partial) unique index: PostgREST upserts can't target partial indexes, and
-- NULLs are distinct anyway so manual rows (source_ref NULL) never clash.
create unique index if not exists uq_avatar_knowledge_source
    on avatar_knowledge(avatar_id, source_ref);
create index if not exists idx_avatar_knowledge_avatar on avatar_knowledge(avatar_id);
create index if not exists idx_avatar_knowledge_embedding
    on avatar_knowledge using hnsw (embedding vector_cosine_ops);

create or replace function match_avatar_knowledge(
    p_avatar_id uuid,
    p_query_embedding vector(768),
    p_match_count int default 6,
    p_min_similarity float default 0.30
) returns table (id uuid, kind text, title text, content text, metadata jsonb, similarity float)
language sql stable as $$
    select k.id, k.kind, k.title, k.content, k.metadata,
           1 - (k.embedding <=> p_query_embedding) as similarity
    from avatar_knowledge k
    where k.avatar_id = p_avatar_id
      and k.embedding is not null
      and 1 - (k.embedding <=> p_query_embedding) >= p_min_similarity
    order by k.embedding <=> p_query_embedding
    limit p_match_count;
$$;

alter table avatar_personas enable row level security;
alter table avatar_knowledge enable row level security;
