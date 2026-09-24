-- გლობალური პარამეტრები („ტარიფები" ტაბი): ფასნამატები/რისკი (default), მოგების
-- ზღვრები, საგადასახადო პარამეტრები, საბანკო გარანტიის წლიური საკომისიო % და
-- ახალი პროექტის default-ები (გარანტიის მოცულობა %, დღეები).
-- კითხვა — ყველა; ჩაწერა — მხოლოდ app_admin_write-ით (ფინანსები).
-- უსაფრთხოა ძველ ვერსიაზეც (მხოლოდ ამატებს).

create table if not exists public.app_settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
drop policy if exists "app_settings select" on public.app_settings;
create policy "app_settings select" on public.app_settings for select using (true);
grant select on public.app_settings to anon, authenticated;
revoke insert, update, delete on public.app_settings from anon, authenticated;

-- app_admin_write-ის დაშვებულ ცხრილებში app_settings-ის დამატება (idempotent)
do $$
declare d text;
begin
  d := pg_get_functiondef('public.app_admin_write(text,text,text,jsonb,text,text)'::regprocedure);
  if position('''app_settings''' in d) = 0 then
    d := replace(d, '''sales_plans'', ''pipeline_projects''', '''sales_plans'', ''pipeline_projects'', ''app_settings''');
    execute d;
  end if;
end $$;
