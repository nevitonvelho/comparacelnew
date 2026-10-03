import { NextRequest, NextResponse } from "next/server";
import { adminHeaders, adminFailure, requireAdministrator } from "@/lib/admin-api";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try { const account = await requireAdministrator(request); return NextResponse.json({ uid: account.uid, email: account.email }, { headers: adminHeaders }); }
  catch (error) { return adminFailure(error); }
}
