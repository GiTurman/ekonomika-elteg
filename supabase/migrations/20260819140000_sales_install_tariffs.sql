-- გაყიდვების მონტაჟის ტარიფის ბუფერი: install_tariff_rules-ს ემატება sales-განაკვეთები.
-- როცა sales-განაკვეთი > რეალურ განაკვეთზე, სხვაობა (× სართული × დარიცხვები) ბუფერად ჯდება
-- ზედნადებ ხარჯში (markup-ნეიტრალურად): full ხედავს ზედნადების ხაზში, sales — ცალკე ვერ ხედავს,
-- თუმცა საბოლოო ფასში ჩაითვლება. NULL/0 → ბუფერი არ არის (ქცევა უცვლელი). Idempotent.
ALTER TABLE public.install_tariff_rules ADD COLUMN IF NOT EXISTS mech_rate_sales numeric;
ALTER TABLE public.install_tariff_rules ADD COLUMN IF NOT EXISTS elec_rate_sales numeric;
