-- ============================================================================
-- Quiz-It Permanent Question Memory
-- Run this once in the Supabase SQL Editor.
--
-- The existing public.questions table is the permanent, cross-session library.
-- This migration makes it the authoritative "Question Memory": a normalized
-- text column + indexes + a server-side check function used to reject any newly
-- generated question that already exists or is substantially similar.
--
-- No embeddings / vector search yet. A pgvector branch can later be added INSIDE
-- check_question_memory WITHOUT changing any application code, because callers
-- only depend on this function's contract: (text, type) -> matching id or NULL.
-- ============================================================================

-- 1. Trigram matching, used for "substantially similar" detection at scale.
create extension if not exists pg_trgm;

-- 2. Normalized question text: lowercase, collapse all whitespace runs to a
--    single space, trim. STORED generated column, so:
--      - existing rows are BACKFILLED automatically at ALTER time, and
--      - every future insert/update stays in sync with no trigger to maintain.
--    Matches the client-side normalizeQuestionText() exactly.
alter table public.questions
  add column if not exists question_norm text
  generated always as (
    trim(regexp_replace(lower(question_text), '[[:space:]]+', ' ', 'g'))
  ) stored;

-- 3. Indexes for scaling to tens of thousands of rows.
--    3a. Exact / normalized lookup (also covers the common per-type filter).
create index if not exists questions_question_norm_idx
  on public.questions (question_type, question_norm);
--    3b. Trigram GIN index so the `%` similarity operator is index-accelerated.
create index if not exists questions_question_norm_trgm_idx
  on public.questions using gin (question_norm gin_trgm_ops);

-- 4. Server-side Question Memory check.
--    Returns the id of an existing question that is identical (normalized) or
--    substantially similar (trigram similarity >= p_threshold) for the given
--    type, otherwise NULL. Exact match is tried first (cheapest, indexed); the
--    near-duplicate pass uses the trigram GIN index via the `%` operator.
create or replace function public.check_question_memory(
  p_text text,
  p_type text default null,
  p_threshold real default 0.6
) returns bigint
language plpgsql
stable
as $$
declare
  v_norm text := trim(regexp_replace(lower(coalesce(p_text, '')), '[[:space:]]+', ' ', 'g'));
  v_id bigint;
begin
  if v_norm = '' then
    return null;
  end if;

  -- Exact normalized match first (indexed).
  select id into v_id
  from public.questions
  where question_norm = v_norm
    and (p_type is null or question_type = p_type)
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  -- Near-duplicate match via trigram similarity (GIN-index accelerated).
  perform set_config('pg_trgm.similarity_threshold', p_threshold::text, true);
  select id into v_id
  from public.questions
  where (p_type is null or question_type = p_type)
    and question_norm % v_norm
  order by similarity(question_norm, v_norm) desc
  limit 1;

  return v_id;
end;
$$;

-- Allow the app's client roles to call the check.
grant execute on function public.check_question_memory(text, text, real) to anon, authenticated;
