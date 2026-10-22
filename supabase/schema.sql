-- AFTER. persistent memory schema. Run this once in the Supabase SQL Editor.
create table if not exists public.after_memory (
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_key text not null check (memory_key in ('after_profile','after_current','after_payouts','after_test','after_tests')),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, memory_key)
);
alter table public.after_memory enable row level security;
revoke all on public.after_memory from anon;
grant select, insert, update, delete on public.after_memory to authenticated;
drop policy if exists "Users manage their own AFTER memory" on public.after_memory;
create policy "Users manage their own AFTER memory" on public.after_memory for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
