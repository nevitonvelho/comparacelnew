import { NextRequest, NextResponse } from "next/server";
import { adminHeaders, adminFailure, requireAdministrator } from "@/lib/admin-api";
import { getAdminDatabase } from "@/lib/firebase/admin";
import { readAdminDashboard } from "@/lib/admin-store";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try { await requireAdministrator(request); return NextResponse.json(await readAdminDashboard(getAdminDatabase()), { headers: adminHeaders }); }
  catch (error) { return adminFailure(error); }
}
