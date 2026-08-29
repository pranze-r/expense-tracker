-- Run this ONCE in Supabase's SQL Editor (Dashboard -> SQL Editor -> New query)
-- AFTER you've run `npx prisma migrate dev` locally (so the public."User"
-- table already exists).
--
-- Why this can't just be a normal Prisma migration: Prisma diffs migrations
-- against a throwaway "shadow" database that doesn't have Supabase's
-- auth.users table, so a migration referencing auth.users would fail there.
-- This is Supabase-specific setup, run directly against your real database.
--
-- What it does: every time someone signs up via Supabase Auth (a new row
-- appears in auth.users), automatically create a matching row in our own
-- public."User" table, using the SAME id. That's what lets the rest of the
-- app (Book, BookMember, Transaction) attach data to "the logged-in user"
-- without a separate signup-sync API call.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public."User" (id, email, "createdAt", "updatedAt")
  values (new.id, new.email, now(), now())
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
