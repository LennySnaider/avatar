-- F4.2.g — Elimina las políticas RLS pre-multitenant (auth.uid() es
-- inevaluable bajo NextAuth; con service-role no aplican y con anon son
-- superficie de lectura indebida — "Anyone can read providers" era pública).
-- Decisión 4.5 del SUPER-PLAN: RLS ON sin políticas = backstop anti-anon.
-- Solo reglas de acceso: ninguna fila se toca. Nombres verificados en prod
-- el 2026-07-22.
drop policy if exists "Users can delete own avatars"      on public.avatars;
drop policy if exists "Users can insert own avatars"      on public.avatars;
drop policy if exists "Users can update own avatars"      on public.avatars;
drop policy if exists "Users can view own avatars"        on public.avatars;
drop policy if exists "Users can delete own prompts"      on public.prompts;
drop policy if exists "Users can insert own prompts"      on public.prompts;
drop policy if exists "Users can update own prompts"      on public.prompts;
drop policy if exists "Users can view own prompts"        on public.prompts;
drop policy if exists "Users can delete own references"   on public.avatar_references;
drop policy if exists "Users can insert own references"   on public.avatar_references;
drop policy if exists "Users can view own references"     on public.avatar_references;
drop policy if exists "Users can delete own generations"  on public.generations;
drop policy if exists "Users can insert own generations"  on public.generations;
drop policy if exists "Users can view own generations"    on public.generations;
drop policy if exists "Users can CRUD own flows"          on public.video_flows;
drop policy if exists "Anyone can read providers"         on public.ai_providers;
