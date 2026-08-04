-- ფასნამატის ველების (დანადგარის/მონტაჟის ფასნამატი %) ჩაკეტვა:
-- მხოლოდ "full" role-ს (ფინანსდირექტორი) შეუძლია რედაქტირება.
-- canEditField-ის ლოგიკა: თუ ველზე ჩანაწერი არ არსებობს → ღიაა ყველასთვის.
-- ამიტომ საჭიროა ცხადი ჩანაწერი allowed_roles = {full}, რომ სხვამ ვერ შეცვალოს.
-- Idempotent: თუ ჩანაწერი უკვე არსებობს — მხოლოდ allowed_roles ნადგურდება/დგება {full}.

DO $$
BEGIN
  -- დანადგარის ფასნამატი %
  IF EXISTS (SELECT 1 FROM public.field_permissions WHERE field_key = 'unit.equipmentMarkupPct') THEN
    UPDATE public.field_permissions
      SET allowed_roles = ARRAY['full']
      WHERE field_key = 'unit.equipmentMarkupPct';
  ELSE
    INSERT INTO public.field_permissions (field_key, label, section, allowed_roles)
      VALUES ('unit.equipmentMarkupPct', 'დანადგარის ფასნამატი %', 'unit', ARRAY['full']);
  END IF;

  -- მონტაჟის ფასნამატი %
  IF EXISTS (SELECT 1 FROM public.field_permissions WHERE field_key = 'unit.installMarkupPct') THEN
    UPDATE public.field_permissions
      SET allowed_roles = ARRAY['full']
      WHERE field_key = 'unit.installMarkupPct';
  ELSE
    INSERT INTO public.field_permissions (field_key, label, section, allowed_roles)
      VALUES ('unit.installMarkupPct', 'მონტაჟის ფასნამატი %', 'unit', ARRAY['full']);
  END IF;
END $$;
