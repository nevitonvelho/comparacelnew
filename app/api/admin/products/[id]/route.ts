import { NextRequest, NextResponse } from "next/server";
import { adminHeaders, adminFailure, requireAdministrator, readAdminJson } from "@/lib/admin-api";
import { getAdminDatabase } from "@/lib/firebase/admin";
import { saveAdminProduct } from "@/lib/admin-store";
import { AdminError } from "@/lib/admin-model";
import { invalidateServerCatalog } from "@/lib/server-catalog";
export const runtime = "nodejs";
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const account = await requireAdministrator(request); const value = await readAdminJson(request); if (value?.id !== (await params).id) throw new AdminError("A URL do produto não pode ser alterada."); const product = await saveAdminProduct(getAdminDatabase(), account, value, false); invalidateServerCatalog(); return NextResponse.json({ product }, { headers: adminHeaders }); }
  catch (error) { return adminFailure(error); }
}
