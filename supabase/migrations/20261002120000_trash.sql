-- სანაგვე: ყველა წაშლა (app_admin_write → delete) ჯერ ინახება deleted_items-ში.
-- სიის ნახვა / აღდგენა / საბოლოო წაშლა — მხოლოდ full როლი (app_is_full).

create table if not exists public.deleted_items (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,
  key_col     text not null,
  row_key     text not null,
  data        jsonb not null,
  deleted_at  timestamptz not null default now(),
  deleted_by  text
);
create index if not exists deleted_items_deleted_at_idx on public.deleted_items (deleted_at desc);
alter table public.deleted_items enable row level security;
revoke all on public.deleted_items from anon, authenticated;

-- წაშლამდე არქივირება
create or replace function public._trash_rows(p_table text, p_keycol text, p_key text, p_by text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_key = '*' then
    execute format(
      'insert into public.deleted_items (table_name, key_col, row_key, data, deleted_by)
         select %L, %L, t.%I::text, to_jsonb(t), $1 from public.%I t',
      p_table, p_keycol, p_keycol, p_table) using p_by;
  else
    execute format(
      'insert into public.deleted_items (table_name, key_col, row_key, data, deleted_by)
         select %L, %L, t.%I::text, to_jsonb(t), $2 from public.%I t where t.%I::text = $1',
      p_table, p_keycol, p_keycol, p_table, p_keycol) using p_key, p_by;
  end if;
end $$;
revoke all on function public._trash_rows(text, text, text, text) from public, anon, authenticated;

create or replace function public.app_admin_write(p_code text, p_table text, p_op text, p_row jsonb DEFAULT '{}'::jsonb, p_key text DEFAULT NULL::text, p_conflict text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_allowed constant text[] := array[
    'app_users', 'app_backups', 'install_tariff_rules', 'page_permissions',
    'field_permissions', 'field_visibility', 'dropdown_options', 'sales_plans', 'pipeline_projects', 'app_settings'
  ];
  v_keycol text;
  v_cols text;
  v_conf text[];
  v_conf_sql text;
  v_set text;
  v_caller uuid;
  v_caller_name text;
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

  select u.id, u.name into v_caller, v_caller_name from public.app_users u where u.code = btrim(p_code);

  if p_table = 'app_users' then
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
      perform public._trash_rows(p_table, v_keycol, '*', v_caller_name);
      delete from public.app_backups where true;
    else
      perform public._trash_rows(p_table, v_keycol, p_key, v_caller_name);
      execute format('delete from public.%I t where t.%I::text = $1', p_table, v_keycol) using p_key;
    end if;

  else
    raise exception 'unknown op %', p_op;
  end if;
end;
$function$;

-- სია (data-ს გარეშე, მხოლოდ სახელი/ზომა)
create or replace function public.app_trash_list(p_code text)
returns table (id uuid, table_name text, row_key text, label text, deleted_at timestamptz, deleted_by text, size_bytes int)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.app_is_full(p_code) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select d.id, d.table_name, d.row_key,
           coalesce(d.data->>'name', d.data->>'label', d.data->>'project_name',
                    d.data->'data'->>'name', d.data->'data'->>'projectName',
                    d.data->>'field_key', d.data->>'page_key', d.row_key) as label,
           d.deleted_at, d.deleted_by, octet_length(d.data::text)
      from public.deleted_items d
     order by d.deleted_at desc;
end $$;

-- აღდგენა: ჩანაწერი ბრუნდება იმავე id-ით; თუ ასეთი უკვე არსებობს — შეცდომა
create or replace function public.app_trash_restore(p_code text, p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare d public.deleted_items; v_exists boolean;
begin
  if not public.app_is_full(p_code) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into d from public.deleted_items where id = p_id;
  if not found then raise exception 'not found'; end if;
  execute format('select exists (select 1 from public.%I t where t.%I::text = $1)', d.table_name, d.key_col)
    into v_exists using d.row_key;
  if v_exists then raise exception 'already exists'; end if;
  execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
                 d.table_name, d.table_name) using d.data;
  delete from public.deleted_items where id = p_id;
end $$;

-- საბოლოო წაშლა (p_id null → ყველა)
create or replace function public.app_trash_purge(p_code text, p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.app_is_full(p_code) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_id is null then delete from public.deleted_items where true;
  else delete from public.deleted_items where id = p_id; end if;
end $$;

revoke all on function public.app_trash_list(text) from public;
revoke all on function public.app_trash_restore(text, uuid) from public;
revoke all on function public.app_trash_purge(text, uuid) from public;
grant execute on function public.app_trash_list(text) to anon, authenticated;
grant execute on function public.app_trash_restore(text, uuid) to anon, authenticated;
grant execute on function public.app_trash_purge(text, uuid) to anon, authenticated;
grant execute on function public.app_admin_write(text, text, text, jsonb, text, text) to anon, authenticated;
