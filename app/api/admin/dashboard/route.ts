import { NextRequest, NextResponse } from "next/server";
import { adminHeaders, adminFailure, requireAdministrator } from "@/lib/admin-api";
import { getAdminDatabase } from "@/lib/firebase/admin";
import { readAdminUsers } from "@/lib/admin-users";
import { readAdminDashboard } from "@/lib/admin-store";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try { const account = await requireAdministrator(request); const dashboard = await readAdminDashboard(getAdminDatabase()); if (!account.access.permissions.includes("audit.view")) dashboard.audit = []; const users = account.access.role === "administrator" ? (await readAdminUsers()).length : null; return NextResponse.json({ ...dashboard, users }, { headers: adminHeaders }); }
  catch (error) { return adminFailure(error); }
}
