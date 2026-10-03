import { NextRequest, NextResponse } from "next/server";
import { adminHeaders, adminFailure, requireAdministrator, readAdminJson } from "@/lib/admin-api";
import { getAdminDatabase } from "@/lib/firebase/admin";
import { createAdminReference } from "@/lib/admin-store";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try { const account = await requireAdministrator(request); const item = await createAdminReference(getAdminDatabase(), account, await readAdminJson(request)); return NextResponse.json({ item }, { status: 201, headers: adminHeaders }); }
  catch (error) { return adminFailure(error); }
}
