import { NextRequest, NextResponse } from "next/server";
import { adminFailure, adminHeaders, requireAdministrator } from "@/lib/admin-api";
import { getAdminDatabase } from "@/lib/firebase/admin";
import { claimSeoAction, readSeoTarget } from "@/lib/admin-seo";
import { fetchSearchSnapshot } from "@/lib/search-console";
import { searchConnectionStatus } from "@/lib/search-console-oauth";
import { siteUrl } from "@/lib/seo";
import { comparisonSlug } from "@/lib/product-model";
import { validateSeoPath, type SearchSnapshot, type SeoReport } from "@/lib/seo-workbench";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    await requireAdministrator(request, "seo.manage");
    const db = getAdminDatabase();
    const [products, comparisons, activity, custom, saved] = await Promise.all([
      db.collection("products").get(), db.collection("comparisons").limit(2500).get(), db.collection("comparisonActivity").limit(2500).get(), db.collection("seoPages").limit(2500).get(), db.collection("adminSeoReports").doc("latest").get(),
    ]);
    const snapshot = saved.data()?.snapshot as SearchSnapshot | undefined;
    const preload = { products: new Map(products.docs.map(doc => [doc.id, doc.data()])), seo: new Map(custom.docs.map(doc => [String(doc.data().path), doc.data()])) };
    const paths = new Set(products.docs.map(doc => `/produto/${doc.id}`));
    for (const doc of [...comparisons.docs, ...activity.docs]) {
      const data = doc.data();
      const ids = Array.isArray(data.productIds) ? data.productIds : [data.productASlug, data.productBSlug];
      if (ids.length === 2 && ids.every(id => typeof id === "string")) paths.add(`/comparar/${comparisonSlug(ids)}`);
    }
    for (const path of preload.seo.keys()) paths.add(path);
    for (const row of snapshot?.rows || []) {
      try { const url = new URL(row.keys[0]); if (url.origin === siteUrl && !url.search) paths.add(url.pathname); } catch {}
    }
    const pages: SeoReport["pages"] = [];
    for (const path of paths) {
      try {
        const parsed = validateSeoPath(path);
        if (parsed.ids.some(id => !preload.products.has(id))) continue;
        if (parsed.ids.length === 2 && preload.products.get(parsed.ids[0])?.categorySlug !== preload.products.get(parsed.ids[1])?.categorySlug) continue;
        const page = (await readSeoTarget(db, path, snapshot, preload)).page;
        pages.push({ path: page.path, kind: page.kind, name: page.name, active: page.active, score: page.score, issues: page.issues, current: page.current, previous: page.previous, performance: page.performance });
      } catch { /* Ignore legacy paths that cannot be mapped to current products. */ }
    }
    const connection = await searchConnectionStatus();
    const summary = snapshot ? { fetchedAt: snapshot.fetchedAt, startDate: snapshot.startDate, endDate: snapshot.endDate, previousStartDate: snapshot.previousStartDate, previousEndDate: snapshot.previousEndDate, truncated: snapshot.truncated, property: snapshot.property } : null;
    return NextResponse.json({ connection, pages, snapshot: summary, searchConfigured: connection.connected, geminiConfigured: Boolean(process.env.GEMINI_API_KEY), truncated: [comparisons, activity, custom].some(result => result.size === 2500) } satisfies SeoReport, { headers: adminHeaders });
  } catch (error) { return adminFailure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdministrator(request, "seo.manage");
    const db = getAdminDatabase();
    await claimSeoAction(db, actor.uid, "sync");
    const snapshot = await fetchSearchSnapshot();
    await db.collection("adminSeoReports").doc("latest").set({ snapshot });
    return NextResponse.json({ fetchedAt: snapshot.fetchedAt }, { headers: adminHeaders });
  } catch (error) { return adminFailure(error); }
}
