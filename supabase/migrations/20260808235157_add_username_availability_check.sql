-- Let the signup form check username availability before creating an Auth user.
-- The function returns only a boolean and does not expose profile rows.
create or replace function public.is_username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when candidate is null
      or btrim(candidate) !~ '^[A-Za-z0-9_]{3,20}$'
      then false
    else not exists (
      select 1
      from public.profiles p
      where lower(p.username) = lower(btrim(candidate))
    )
  end;
$$;

revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;
