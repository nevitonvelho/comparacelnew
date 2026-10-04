import { NextRequest, NextResponse } from "next/server";
import { adminHeaders, adminFailure, requireAdministrator, readAdminJson } from "@/lib/admin-api";
import { getAdminDatabase } from "@/lib/firebase/admin";
import { AdminError } from "@/lib/admin-model";
import { createAdminReference } from "@/lib/admin-store";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try { const account = await requireAdministrator(request); const value = await readAdminJson(request); const permission = value?.kind === "brands" ? "brands.manage" : "stores.manage"; if (!account.access.permissions.includes(permission)) throw new AdminError("Sem permissão para este cadastro.", 403); const item = await createAdminReference(getAdminDatabase(), account, value); return NextResponse.json({ item }, { status: 201, headers: adminHeaders }); }
  catch (error) { return adminFailure(error); }
}
