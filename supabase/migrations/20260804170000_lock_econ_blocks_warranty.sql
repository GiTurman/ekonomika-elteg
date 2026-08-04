-- ეკონომიკის ცხრილის input ბლოკების (საბოლოო შეთავაზება / ფაქტი) და
-- გარანტიის % ველის ჩაკეტვა: default-ად მხოლოდ "full" role.
-- ორივე ცხრილში: field_visibility (ხედვა) + field_permissions (შევსება).
--
-- canSeeField/canEditField ლოგიკა: თუ ველზე ჩანაწერი არ არსებობს → ღიაა.
-- ამიტომ ცხადი ჩანაწერი allowed_roles = {full} საჭიროა, რომ sales/სხვამ ვერ ნახოს/შეავსოს.
--
-- ბლოკ-key-ები (econ.<block>) EconomicsSheet-ის ReportBlock-ებს შეესაბამება:
--   purchase = შესყიდვის ხარჯები | install = მონტაჟის ხარჯები |
--   markup = ფასნამატი | extras = დამატებითი ხარჯები | final = საბოლოო ფასი
-- Idempotent: არსებულ ჩანაწერს allowed_roles={full}-ზე დააბრუნებს, არარსებულს ჩასვამს.

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('econ.purchase',      'ეკონომიკა — შესყიდვის ხარჯები (input)', 'economics'),
      ('econ.install',       'ეკონომიკა — მონტაჟის ხარჯები (input)',  'economics'),
      ('econ.markup',        'ეკონომიკა — ფასნამატი (input)',          'economics'),
      ('econ.extras',        'ეკონომიკა — დამატებითი ხარჯები (input)', 'economics'),
      ('econ.final',         'ეკონომიკა — საბოლოო ფასი (input)',       'economics'),
      ('unit.warrantyPct',   'გარანტიის % (ქარხნული ფასიდან)',        'unit')
    ) AS t(field_key, label, section)
  LOOP
    -- field_visibility (ხედვა)
    IF EXISTS (SELECT 1 FROM public.field_visibility WHERE field_key = rec.field_key) THEN
      UPDATE public.field_visibility SET allowed_roles = ARRAY['full'] WHERE field_key = rec.field_key;
    ELSE
      INSERT INTO public.field_visibility (field_key, label, section, allowed_roles)
        VALUES (rec.field_key, rec.label, rec.section, ARRAY['full']);
    END IF;

    -- field_permissions (შევსება)
    IF EXISTS (SELECT 1 FROM public.field_permissions WHERE field_key = rec.field_key) THEN
      UPDATE public.field_permissions SET allowed_roles = ARRAY['full'] WHERE field_key = rec.field_key;
    ELSE
      INSERT INTO public.field_permissions (field_key, label, section, allowed_roles)
        VALUES (rec.field_key, rec.label, rec.section, ARRAY['full']);
    END IF;
  END LOOP;
END $$;
