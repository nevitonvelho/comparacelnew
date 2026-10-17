import { NextRequest, NextResponse } from "next/server";
import { adminFailure, adminHeaders, readAdminJson, requireAdministrator } from "@/lib/admin-api";
import { getAdminDatabase } from "@/lib/firebase/admin";
import { readSeoTarget, saveSeoFields, seoHistory } from "@/lib/admin-seo";
import { querySearchConsole } from "@/lib/search-console";
import { absoluteUrl } from "@/lib/seo";
import { invalidateServerCatalog } from "@/lib/server-catalog";
import { validateSeoPath, type SearchRow, type SearchSnapshot, type SeoDetail } from "@/lib/seo-workbench";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  try {
    await requireAdministrator(request, "seo.manage");
    const path = validateSeoPath(request.nextUrl.searchParams.get("path")).path;
    const db = getAdminDatabase();
    const snapshot = (await db.collection("adminSeoReports").doc("latest").get()).data()?.snapshot as SearchSnapshot | undefined;
    const [{ page }, history] = await Promise.all([readSeoTarget(db, path, snapshot), seoHistory(db, path)]);
    let queries: SearchRow[] = [];
    let queryWarning: string | undefined;
    if (snapshot) {
      try { queries = (await querySearchConsole({ startDate: snapshot.startDate, endDate: snapshot.endDate, dimensions: ["query"], rowLimit: 20, dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "equals", expression: absoluteUrl(path) }] }] })).rows; }
      catch { queryWarning = "Não foi possível carregar as buscas desta página. O diagnóstico do conteúdo continua disponível."; }
    }
    return NextResponse.json({ page, queries, history, ...(queryWarning ? { queryWarning } : {}) } satisfies SeoDetail, { headers: adminHeaders });
  } catch (error) { return adminFailure(error); }
}
export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireAdministrator(request, "seo.manage");
    const input = await readAdminJson(request);
    const path = validateSeoPath(input?.path).path;
    const result = await saveSeoFields(getAdminDatabase(), actor, path, input?.fingerprint, input?.fields);
    invalidateServerCatalog();
    return NextResponse.json(result, { headers: adminHeaders });
  } catch (error) { return adminFailure(error); }
}
