-- გაყიდვების (sales) როლს ვაძლევთ დანადგარის ფასნამატის (unit.equipmentMarkupPct)
-- რედაქტირების უფლებას. მარჟის იატაკი (მინ. მარჟა) აღსრულდება აპლიკაციაში —
-- გაყიდვები ფასნამატს ვერ ჩამოწევს იმ დონემდე, სადაც მარჟა ტარიფებში დადგენილ
-- profitThresholds[category].minMarginPct-ზე დაბლა ჩამოვა.
-- მონტაჟის ფასნამატი (installMarkupPct) რჩება მხოლოდ full-ზე. Idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.field_permissions WHERE field_key = 'unit.equipmentMarkupPct') THEN
    UPDATE public.field_permissions
      SET allowed_roles = ARRAY['full','sales']
      WHERE field_key = 'unit.equipmentMarkupPct';
  ELSE
    INSERT INTO public.field_permissions (field_key, label, section, allowed_roles)
      VALUES ('unit.equipmentMarkupPct', 'დანადგარის ფასნამატი %', 'unit', ARRAY['full','sales']);
  END IF;
END $$;
