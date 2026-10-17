import { NextRequest, NextResponse } from "next/server";
import { adminFailure, adminHeaders, readAdminJson, requireAdministrator } from "@/lib/admin-api";
import { getAdminDatabase } from "@/lib/firebase/admin";
import { claimSeoAction, readSeoTarget } from "@/lib/admin-seo";
import { generateSeoSuggestion } from "@/lib/gemini-seo";
import { querySearchConsole } from "@/lib/search-console";
import { absoluteUrl } from "@/lib/seo";
import { AdminError } from "@/lib/admin-model";
import { validateSeoPath, type SearchRow, type SearchSnapshot } from "@/lib/seo-workbench";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdministrator(request, "seo.manage");
    const input = await readAdminJson(request);
    const path = validateSeoPath(input?.path).path;
    const db = getAdminDatabase();
    const target = await readSeoTarget(db, path);
    if (input?.fingerprint !== target.page.fingerprint) throw new AdminError("A página mudou. Reabra o diagnóstico antes de gerar.", 409);
    await claimSeoAction(db, actor.uid, "generate");
    const snapshot = (await db.collection("adminSeoReports").doc("latest").get()).data()?.snapshot as SearchSnapshot | undefined;
    let queries: SearchRow[] = [];
    let warning: string | undefined;
    if (snapshot) {
      try { queries = (await querySearchConsole({ startDate: snapshot.startDate, endDate: snapshot.endDate, dimensions: ["query"], rowLimit: 20, dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "equals", expression: absoluteUrl(path) }] }] })).rows; }
      catch { warning = "Sugestão gerada sem buscas do Search Console; foram usados os dados cadastrados."; }
    }
    const result = await generateSeoSuggestion(target.context, target.page.fields, queries);
    return NextResponse.json({ ...result, fingerprint: target.page.fingerprint, ...(warning ? { warning } : {}) }, { headers: adminHeaders });
  } catch (error) { return adminFailure(error); }
}
