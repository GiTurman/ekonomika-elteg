-- ფორმა 505: ჩანაწერის წაშლა ფინანსებისა და კომერციისთვის (სანაგვეში გადატანით).
-- უკვე გაშვებულია Lovable Cloud-ში 2026-10-21.
create or replace function public.app_pipeline_delete(p_code text, p_id text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_name text; v_role text;
begin
  select name, role into v_name, v_role from public.app_users
   where btrim(coalesce(p_code,'')) <> '' and code = btrim(p_code);
  if v_role is null or v_role not in ('full','commercial') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_id is null or p_id = '' or p_id = '*' then raise exception 'key required'; end if;
  perform public._trash_rows('pipeline_projects', 'id', p_id, v_name);
  delete from public.pipeline_projects where id::text = p_id;
end $$;
revoke all on function public.app_pipeline_delete(text,text) from public;
grant execute on function public.app_pipeline_delete(text,text) to anon, authenticated;
