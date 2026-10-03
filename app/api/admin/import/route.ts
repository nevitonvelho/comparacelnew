import { randomUUID } from "node:crypto";
import { getDownloadURL } from "firebase-admin/storage";
import { NextRequest, NextResponse } from "next/server";
import { adminFailure, adminHeaders, readAdminJson, requireAdministrator } from "@/lib/admin-api";
import { AdminError } from "@/lib/admin-model";
import { parseImportLine, type CollectedProduct } from "@/lib/admin-import-model";
import { parseAmazonProduct, parseMercadoProduct } from "@/lib/admin-import-parser";
import { fetchImportResource } from "@/lib/admin-import-fetch";
import { resolveMercadoEntry } from "@/lib/admin-import-resolver";
import { findImportProduct, persistImportedProduct } from "@/lib/admin-import-store";
import { getAdminBucket, getAdminDatabase } from "@/lib/firebase/admin";
import { inspectAdminImage } from "@/lib/admin-image";
import { categoryNames } from "@/lib/product-model";
import { invalidateServerCatalog } from "@/lib/server-catalog";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(request: NextRequest) {
  let release: (() => Promise<void>) | undefined;
  try {
    const account = await requireAdministrator(request);
    const input = await readAdminJson(request) as { source?: unknown; line?: unknown; category?: unknown; downloadImages?: unknown };
    if (!input || !["amazon", "mercadolivre"].includes(String(input.source)) || typeof input.line !== "string" || input.line.length > 4500 || typeof input.category !== "string" || !Object.hasOwn(categoryNames, input.category) || typeof input.downloadImages !== "boolean") throw new AdminError("Confira a fonte, a categoria e o link.");
    const source = input.source as "amazon" | "mercadolivre";
    let entry = parseImportLine(input.line, source);
    if (source === "mercadolivre" && !process.env.ML_ACCESS_TOKEN) throw new AdminError("Configure ML_ACCESS_TOKEN no servidor para importar do Mercado Livre.", 503);
    const db = getAdminDatabase();
    const categories = await db.collection("categories").where("slug", "==", input.category).limit(1).get();
    if (categories.empty) throw new AdminError("Categoria não cadastrada.");
    const budget = db.doc(`adminImportBudgets/${account.uid}`);
    const lease = randomUUID();
    await db.runTransaction(async tx => {
      const old = (await tx.get(budget)).data() ?? {};
      const now = Date.now();
      if (Number(old.lockUntil) > now || now - Number(old.lastAt ?? 0) < 4000) throw new AdminError("Aguarde a importação em andamento e tente novamente.", 429);
      const sameWindow = now - Number(old.windowAt ?? 0) < 3600000;
      if (sameWindow && Number(old.count) >= 200) throw new AdminError("Limite de 200 produtos por hora. Continue o lote mais tarde.", 429);
      tx.set(budget, { lease, lockUntil: now + 120000, lastAt: now, windowAt: sameWindow ? old.windowAt : now, count: sameWindow ? Number(old.count ?? 0) + 1 : 1 });
    });
    release = () => db.runTransaction(async tx => { const old = await tx.get(budget); if (old.data()?.lease === lease) tx.update(budget, { lockUntil: 0 }); });
    let collected: CollectedProduct;
    if (source === "amazon") {
      const resource = await fetchImportResource(entry.productUrl, "amazon");
      const resolvedId = entry.externalId || resource.url.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i)?.[1].toUpperCase() || "";
      collected = parseAmazonProduct(resource.bytes.toString("utf8"), { ...entry, externalId: resolvedId });
    } else {
      entry = await resolveMercadoEntry(entry);
      const detail = await fetchImportResource(`https://api.mercadolibre.com/products/${entry.externalId}`, "ml-api", process.env.ML_ACCESS_TOKEN);
      collected = parseMercadoProduct(JSON.parse(detail.bytes.toString("utf8")), entry);
      if (collected.price === null) {
        try { const offers = await fetchImportResource(`https://api.mercadolibre.com/products/${entry.externalId}/items?limit=50`, "ml-api", process.env.ML_ACCESS_TOKEN); const data = JSON.parse(offers.bytes.toString("utf8")); const prices = (data.results ?? []).filter((offer: { condition?: string; price?: unknown }) => offer.condition === "new" && typeof offer.price === "number" && Number.isFinite(offer.price) && offer.price > 0).map((offer: { price: number }) => offer.price); collected.price = prices.length ? Math.min(...prices) : null; } catch { /* A product may be imported without a price when offers are unavailable. */ }
      }
    }
    const existing = await findImportProduct(db, source, collected, input.category);
    const warnings: string[] = [];
    if (collected.price === null) warnings.push("Preço não retornado pela fonte; confira a oferta.");
    let imageUrl = "";
    if (input.downloadImages && !existing?.imageUrl && collected.imageUrl) {
      try {
        const image = await fetchImportResource(collected.imageUrl, "image");
        const info = await inspectAdminImage(image.bytes, image.contentType);
        const file = getAdminBucket().file(`products/import/${randomUUID()}.${info.extension}`);
        await file.save(image.bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: image.contentType, cacheControl: "public,max-age=31536000,immutable", metadata: { firebaseStorageDownloadTokens: randomUUID() } } });
        imageUrl = await getDownloadURL(file);
      } catch { warnings.push("A imagem não pôde ser importada; envie-a na edição do produto."); }
    }
    const result = await persistImportedProduct(db, account, source, collected, existing, input.category, imageUrl);
    invalidateServerCatalog();
    return NextResponse.json({ ...result, warnings }, { headers: adminHeaders });
  } catch (error) { return adminFailure(error); }
  finally { if (release) await release().catch(error => console.error("Falha ao liberar a importação", error instanceof Error ? error.name : "erro")); }
}
