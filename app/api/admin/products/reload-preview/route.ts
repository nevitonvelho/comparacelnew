import { randomUUID } from "node:crypto";
import { getDownloadURL } from "firebase-admin/storage";
import { NextRequest, NextResponse } from "next/server";
import { adminFailure, adminHeaders, readAdminJson, requireAdministrator } from "@/lib/admin-api";
import { AdminError } from "@/lib/admin-model";
import { parseImportLine, type CollectedProduct } from "@/lib/admin-import-model";
import { fetchAmazonProduct } from "@/lib/admin-import-amazon";
import { fetchImportResource } from "@/lib/admin-import-fetch";
import { resolveMercadoEntry } from "@/lib/admin-import-resolver";
import { fetchMercadoApiProduct } from "@/lib/admin-import-mercado-api";
import { getMercadoToken } from "@/lib/mercado-token";
import { getAdminBucket, getAdminDatabase } from "@/lib/firebase/admin";
import { inspectAdminImage } from "@/lib/admin-image";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(request: NextRequest) {
  let release: (() => Promise<void>) | undefined;
  try {
    const account = await requireAdministrator(request, "products.edit");
    const input = await readAdminJson(request) as { source?: unknown; line?: unknown; category?: unknown; downloadImages?: unknown };
    if (!input || !["amazon", "mercadolivre"].includes(String(input.source)) || typeof input.line !== "string" || input.line.length > 4500 || typeof input.downloadImages !== "boolean") throw new AdminError("Confira a fonte, a categoria e o link.");
    const source = input.source as "amazon" | "mercadolivre";
    let entry = parseImportLine(input.line.trim(), source);
    const db = getAdminDatabase();
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
      collected = await fetchAmazonProduct(entry);
    } else {
      entry = await resolveMercadoEntry(entry);
      collected = await fetchMercadoApiProduct(entry, getMercadoToken);
    }
    const warnings: string[] = [];
    if (collected.price === null) warnings.push("Preço não retornado pela fonte; confira a oferta.");
    let imageUrl = "";
    if (input.downloadImages && collected.imageUrl) {
      try {
        const image = await fetchImportResource(collected.imageUrl, "image");
        const info = await inspectAdminImage(image.bytes, image.contentType);
        const file = getAdminBucket().file(`products/import/${randomUUID()}.${info.extension}`);
        await file.save(image.bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: image.contentType, cacheControl: "public,max-age=31536000,immutable", metadata: { firebaseStorageDownloadTokens: randomUUID() } } });
        imageUrl = await getDownloadURL(file);
      } catch { warnings.push("A imagem não pôde ser importada; envie-a na edição do produto."); }
    }
    return NextResponse.json({ collected: { ...collected, imageUrl }, warnings }, { headers: adminHeaders });
  } catch (error) { return adminFailure(error); }
  finally { if (release) await release().catch(error => console.error("Falha ao liberar a importação", error instanceof Error ? error.name : "erro")); }
}
