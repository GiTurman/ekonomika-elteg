import { supabase } from "@/integrations/supabase/client";
import { getStoredUser } from "./access";

// სანაგვე — app_admin_write-ით წაშლილი ყველა ჩანაწერი ჯერ deleted_items-ში ინახება.
// ნახვა / აღდგენა / საბოლოო წაშლა — მხოლოდ full (სერვერი ამოწმებს app_is_full-ით).
export interface TrashItem {
  id: string;
  table_name: string;
  row_key: string;
  label: string;
  deleted_at: string;
  deleted_by: string | null;
  size_bytes: number;
}

export const TRASH_TABLE_LABEL: Record<string, string> = {
  app_backups: "არქივი",
  pipeline_projects: "პაიპლაინი / ფორმა 505",
  sales_plans: "გაყიდვების გეგმა",
  install_tariff_rules: "მონტაჟის ტარიფი",
  app_users: "მომხმარებელი",
  page_permissions: "გვერდის უფლება",
  field_permissions: "ველის უფლება",
  field_visibility: "ველის ხილვადობა",
  dropdown_options: "ჩამოსაშლელი სია",
  app_settings: "პარამეტრები",
};

const code = () => getStoredUser()?.code ?? "";

export async function listTrash(): Promise<TrashItem[]> {
  const { data, error } = await (supabase as any).rpc("app_trash_list", { p_code: code() });
  if (error) throw error;
  return (data ?? []) as TrashItem[];
}

export async function restoreTrash(id: string): Promise<void> {
  const { error } = await (supabase as any).rpc("app_trash_restore", { p_code: code(), p_id: id });
  if (error) throw error;
}

// id = null → სანაგვის სრული გასუფთავება
export async function purgeTrash(id: string | null): Promise<void> {
  const { error } = await (supabase as any).rpc("app_trash_purge", { p_code: code(), p_id: id });
  if (error) throw error;
}
