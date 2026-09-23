-- ✔ გაშვებულია production-ზე 2026-09-23 (Claude, Lovable MCP).
-- მონაცემების გასუფთავება არქივში (app_backups.data → project.units). უსაფრთხოა
-- ნებისმიერ დროს; ფასებს არ ცვლის. გაშვებამდე სარეზერვო ასლი:
-- (ცალკე სქემაში, რომელიც API-ით არ ჩანს)
create schema if not exists backup;
create table if not exists backup.app_backups_20260923 as select * from public.app_backups;

-- 1) ბრენდების ერთიანი ჩაწერა (ჩამონათვალის მიხედვით) — ანალიტიკა აღარ იყოფა
-- 2) კატეგორიის შევსება, სადაც ცარიელია (სახელი/მოდელი/სახეობის მიხედვით)
-- 3) Isani: „ქვეყანა" = „line 1000" → ქვეყანა China, მოდელი line 1000
update public.app_backups b
set data = jsonb_set(
  b.data, '{project,units}',
  (
    select coalesce(jsonb_agg(
      u
      || jsonb_build_object('brand',
           case lower(btrim(coalesce(u->>'brand', '')))
             when 'fuji' then 'Fuji'
             when 'fuji global' then 'Fuji Global'
             when 'kleemann' then 'KLEEMANN'
             when 'kleemann china' then 'Kleemann China'
             when 'glift' then 'G-Lift'
             when 'g-lift' then 'G-Lift'
             when 'prolift' then 'Prolift'
             when 'atlas basic' then 'Atlas Basic'
             when 'flexy r' then 'Flexy R'
             when 'gigas sp' then 'Gigas SP'
             when 'hitachi' then 'HITACHI'
             else u->>'brand' end)
      || jsonb_build_object('category',
           coalesce(u->>'category',
             case
               when (b.name || ' ' || coalesce(u->>'model','') || ' ' || coalesce(u->>'kind','')) ~* '(escal|ესკალ)' then 'escalator'
               when (b.name || ' ' || coalesce(u->>'model','') || ' ' || coalesce(u->>'kind','')) ~* '(travel|ტრაველ)' then 'travelator'
               when (b.name || ' ' || coalesce(u->>'model','') || ' ' || coalesce(u->>'kind','')) ~* '(platform|პლატფ|შშმ)' then 'platform'
               when (b.name || ' ' || coalesce(u->>'model','') || ' ' || coalesce(u->>'kind','')) ~* '(parking|პარკ)' then 'parking'
               else 'lift' end))
      || case when u->>'country' = 'line 1000'
              then jsonb_build_object('country', 'China', 'model', 'line 1000')
              else '{}'::jsonb end
      order by o), '[]'::jsonb)
    from jsonb_array_elements(b.data->'project'->'units') with ordinality as t(u, o)
  )
)
where jsonb_typeof(b.data->'project'->'units') = 'array'
  and jsonb_array_length(b.data->'project'->'units') > 0;

-- ჩამონათვალს დავამატოთ ბრენდი, რომელიც არქივში გვხვდება, მაგრამ სიაში არ იყო
update public.dropdown_options
set options = options || array['MAISON']
where field_key = 'brand' and not ('MAISON' = any(options));

-- შემოწმება: ბრენდები და კატეგორიები გასუფთავების შემდეგ
-- select u->>'brand' brand, u->>'category' cat, count(*) from public.app_backups b,
--   jsonb_array_elements(b.data->'project'->'units') u group by 1,2 order by 1,2;
