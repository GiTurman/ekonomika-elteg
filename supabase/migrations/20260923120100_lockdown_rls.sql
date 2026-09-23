-- ნაბიჯი B (უსაფრთხოება) — გაუშვით მხოლოდ DEPLOY-ის შემდეგ (როცა საიტზე ახალი
-- ვერსიაა, რომელიც app_login / app_admin_write ფუნქციებს იყენებს). ძველ ვერსიაზე
-- ამის გაშვება შესვლას გააჩერებს.

-- 1) app_users — პირდაპირი წვდომა სრულად დახურულია (მხოლოდ RPC ფუნქციებით)
drop policy if exists "allow all select" on public.app_users;
drop policy if exists "allow all insert" on public.app_users;
drop policy if exists "allow all update" on public.app_users;
drop policy if exists "allow all delete" on public.app_users;
revoke all on public.app_users from anon, authenticated;

-- 2) app_backups — წაშლა მხოლოდ app_admin_write-ით (ფინანსები)
drop policy if exists "Public delete backups" on public.app_backups;
revoke delete on public.app_backups from anon, authenticated;

-- 3) ცნობარები / უფლებები / გეგმები — კითხვა ღიაა, ჩაწერა მხოლოდ app_admin_write-ით
drop policy if exists "allow all insert" on public.install_tariff_rules;
drop policy if exists "allow all update" on public.install_tariff_rules;
drop policy if exists "allow all delete" on public.install_tariff_rules;
revoke insert, update, delete on public.install_tariff_rules from anon, authenticated;

drop policy if exists "allow all insert" on public.page_permissions;
drop policy if exists "allow all update" on public.page_permissions;
revoke insert, update, delete on public.page_permissions from anon, authenticated;

drop policy if exists "allow all insert" on public.field_permissions;
drop policy if exists "allow all update" on public.field_permissions;
revoke insert, update, delete on public.field_permissions from anon, authenticated;

drop policy if exists "allow all insert" on public.field_visibility;
drop policy if exists "allow all update" on public.field_visibility;
revoke insert, update, delete on public.field_visibility from anon, authenticated;

drop policy if exists "allow all insert" on public.dropdown_options;
drop policy if exists "allow all update" on public.dropdown_options;
revoke insert, update, delete on public.dropdown_options from anon, authenticated;

drop policy if exists "sales_plans all" on public.sales_plans;
drop policy if exists "sales_plans select" on public.sales_plans;
create policy "sales_plans select" on public.sales_plans for select using (true);
revoke insert, update, delete on public.sales_plans from anon, authenticated;

-- 4) პაიპლაინი — დამატება/რედაქტირება ღიაა (გაყიდვები), წაშლა მხოლოდ ფინანსები
drop policy if exists "allow all delete" on public.pipeline_projects;
revoke delete on public.pipeline_projects from anon, authenticated;

-- 5) app_state — აღარ გამოიყენება (დრაფტი ბრაუზერშია); ჩაწერა დახურულია
drop policy if exists "Public write app_state" on public.app_state;
drop policy if exists "Public update app_state" on public.app_state;
revoke insert, update, delete on public.app_state from anon, authenticated;
