-- გაუთვალისწინებელი % და ზედნადები % (თითო დანადგარზე, გაყიდვების მოდულში ჩანდა)
-- ჩაკეტვა: default-ად მხოლოდ "full" role ხედავს და ავსებს.
-- ორივე ცხრილში: field_visibility (ხედვა — დამალვა) + field_permissions (შევსება).
-- canSeeField/canEditField: ჩანაწერის არარსებობა = ღიაა ყველასთვის, ამიტომ ცხადი {full} საჭიროა.
-- Idempotent.

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('unit.contingencyPct', 'გაუთვალისწინებელი %', 'unit'),
      ('unit.overheadPct',    'ზედნადები %',          'unit')
    ) AS t(field_key, label, section)
  LOOP
    -- ხედვა (დამალვა non-full-ისთვის)
    IF EXISTS (SELECT 1 FROM public.field_visibility WHERE field_key = rec.field_key) THEN
      UPDATE public.field_visibility SET allowed_roles = ARRAY['full'] WHERE field_key = rec.field_key;
    ELSE
      INSERT INTO public.field_visibility (field_key, label, section, allowed_roles)
        VALUES (rec.field_key, rec.label, rec.section, ARRAY['full']);
    END IF;

    -- შევსება
    IF EXISTS (SELECT 1 FROM public.field_permissions WHERE field_key = rec.field_key) THEN
      UPDATE public.field_permissions SET allowed_roles = ARRAY['full'] WHERE field_key = rec.field_key;
    ELSE
      INSERT INTO public.field_permissions (field_key, label, section, allowed_roles)
        VALUES (rec.field_key, rec.label, rec.section, ARRAY['full']);
    END IF;
  END LOOP;
END $$;
