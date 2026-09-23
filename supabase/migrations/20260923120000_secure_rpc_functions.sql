-- ✔ გაშვებულია production-ზე 2026-09-23 (Claude, Lovable MCP).
-- ნაბიჯი A (უსაფრთხოება) — დამატებითი, არაფერს არ ამტვრევს. გაუშვით DEPLOY-მდე.
-- წვდომის კოდის შემოწმება და ადმინისტრაციული ჩაწერები სერვერზე გადადის
-- (SECURITY DEFINER ფუნქციები). ფრონტენდი აღარ კითხულობს app_users.code-ს.

-- მომხმარებელი „ფინანსები" (full) არის თუ არა ამ კოდის მფლობელი
create or replace function public.app_is_full(p_code text)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.app_users
    where btrim(coalesce(p_code, '')) <> '' and code = btrim(p_code) and role = 'full'
  );
$$;

-- შესვლა კოდით — აბრუნებს სახელს/როლს, კოდს არა
create or replace function public.app_login(p_code text)
returns table (id uuid, name text, role text)
language sql security definer set search_path = public stable
as $$
  select u.id, u.name, u.role
  from public.app_users u
  where btrim(coalesce(p_code, '')) <> '' and u.code = btrim(p_code)
  limit 1;
$$;

-- მომხმარებლების სია კოდების გარეშე (გამყიდველის ჩამონათვალისთვის და ა.შ.)
create or replace function public.app_users_public()
returns table (id uuid, name text, role text, created_at timestamptz)
language sql security definer set search_path = public stable
as $$
  select u.id, u.name, u.role, u.created_at from public.app_users u order by u.created_at;
$$;

-- სრული სია კოდებით — მხოლოდ ფინანსებისთვის („ლოგი" → მომხმარებლები)
create or replace function public.app_admin_list_users(p_code text)
returns table (id uuid, name text, code text, role text, created_at timestamptz)
language plpgsql security definer set search_path = public stable
as $$
begin
  if not public.app_is_full(p_code) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query select u.id, u.name, u.code, u.role, u.created_at from public.app_users u order by u.created_at;
end;
$$;

-- ადმინისტრაციული ჩაწერა (მხოლოდ ფინანსები): insert / update / upsert / delete
-- დაშვებული ცხრილების თეთრ სიაზე. სვეტები მოწმდება information_schema-თი.
create or replace function public.app_admin_write(
  p_code text,
  p_table text,
  p_op text,
  p_row jsonb default '{}'::jsonb,
  p_key text default null,
  p_conflict text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_allowed constant text[] := array[
    'app_users', 'app_backups', 'install_tariff_rules', 'page_permissions',
    'field_permissions', 'field_visibility', 'dropdown_options', 'sales_plans', 'pipeline_projects'
  ];
  v_keycol text;
  v_cols text;
  v_conf text[];
  v_conf_sql text;
  v_set text;
  v_caller uuid;
  v_row jsonb := coalesce(p_row, '{}'::jsonb);
begin
  if not public.app_is_full(p_code) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not (p_table = any (v_allowed)) then
    raise exception 'table % not allowed', p_table;
  end if;

  v_keycol := case p_table
    when 'page_permissions' then 'page_key'
    when 'field_permissions' then 'field_key'
    when 'field_visibility' then 'field_key'
    when 'dropdown_options' then 'field_key'
    else 'id' end;

  select string_agg(quote_ident(k), ', ')
    into v_cols
    from jsonb_object_keys(v_row) k
   where exists (select 1 from information_schema.columns c
                  where c.table_schema = 'public' and c.table_name = p_table and c.column_name = k);

  -- საკუთარი ანგარიშის დაცვა
  if p_table = 'app_users' then
    select u.id into v_caller from public.app_users u where u.code = btrim(p_code);
    if p_op = 'delete' and p_key = v_caller::text then
      raise exception 'cannot delete own account';
    end if;
    if p_op = 'update' and p_key = v_caller::text and v_row ? 'role' and v_row->>'role' <> 'full' then
      raise exception 'cannot change own role';
    end if;
  end if;

  if p_op = 'insert' then
    if v_cols is null then raise exception 'no columns'; end if;
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)',
                   p_table, v_cols, v_cols, p_table) using v_row;

  elsif p_op = 'upsert' then
    if v_cols is null then raise exception 'no columns'; end if;
    v_conf := array(select btrim(x) from unnest(string_to_array(coalesce(p_conflict, v_keycol), ',')) x);
    if exists (select 1 from unnest(v_conf) x
                where not exists (select 1 from information_schema.columns c
                                   where c.table_schema = 'public' and c.table_name = p_table and c.column_name = x)) then
      raise exception 'bad conflict columns';
    end if;
    select string_agg(quote_ident(x), ', ') into v_conf_sql from unnest(v_conf) x;
    select string_agg(format('%1$I = excluded.%1$I', k), ', ')
      into v_set
      from jsonb_object_keys(v_row) k
     where k <> all (v_conf)
       and exists (select 1 from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = p_table and c.column_name = k);
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) on conflict (%s) %s',
                   p_table, v_cols, v_cols, p_table, v_conf_sql,
                   case when v_set is null then 'do nothing' else 'do update set ' || v_set end) using v_row;

  elsif p_op = 'update' then
    if p_key is null or v_cols is null then raise exception 'key and columns required'; end if;
    execute format('update public.%I t set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where t.%I::text = $2',
                   p_table, v_cols, v_cols, p_table, v_keycol) using v_row, p_key;

  elsif p_op = 'delete' then
    if p_key is null then raise exception 'key required'; end if;
    if p_key = '*' then
      if p_table <> 'app_backups' then raise exception 'delete-all only for app_backups'; end if;
      delete from public.app_backups where true;
    else
      execute format('delete from public.%I t where t.%I::text = $1', p_table, v_keycol) using p_key;
    end if;

  else
    raise exception 'unknown op %', p_op;
  end if;
end;
$$;

revoke all on function public.app_is_full(text) from public;
grant execute on function public.app_login(text) to anon, authenticated;
grant execute on function public.app_users_public() to anon, authenticated;
grant execute on function public.app_admin_list_users(text) to anon, authenticated;
grant execute on function public.app_admin_write(text, text, text, jsonb, text, text) to anon, authenticated;
