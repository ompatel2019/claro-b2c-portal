"use server";
import { requireAdmin } from "@/lib/auth";
import { loadDetails } from "./compare-data";
export async function compareDetails(a: string, b: string, key: string) {
  await requireAdmin();
  return loadDetails(a, b, key);
}
