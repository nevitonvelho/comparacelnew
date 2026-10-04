import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getDownloadURL } from "firebase-admin/storage";
import { NextRequest, NextResponse } from "next/server";
import { getAdminBucket, getAdminDatabase } from "@/lib/firebase/admin";
import { adminHeaders, adminFailure, requireAdministrator, readAdminBytes } from "@/lib/admin-api";
import { AdminError } from "@/lib/admin-model";
export const runtime = "nodejs";
import { inspectAdminImage, MAX_ADMIN_IMAGE_SIZE as maximum } from "@/lib/admin-image";
export async function POST(request: NextRequest) {
  try {
    const account = await requireAdministrator(request, "products.edit");
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("multipart/form-data;")) throw new AdminError("Envie uma imagem.");
    const raw = await readAdminBytes(request, maximum + 100000);
    const form = await new Response(new Uint8Array(raw).buffer, { headers: { "Content-Type": contentType } }).formData();
    const image = form.get("image");
    if (!(image instanceof File) || !image.size || image.size > maximum) throw new AdminError("Escolha uma imagem de até 5 MB.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(image.type)) throw new AdminError("Use JPG, PNG ou WebP.");
    const bytes = Buffer.from(await image.arrayBuffer());
    const info = await inspectAdminImage(bytes, image.type);
    const path = `products/admin/${randomUUID()}.${info.extension}`;
    const file = getAdminBucket().file(path);
    await file.save(bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: image.type, cacheControl: "public,max-age=31536000,immutable", metadata: { firebaseStorageDownloadTokens: randomUUID() } } });
    const url = await getDownloadURL(file);
    await getAdminDatabase().collection("adminAudit").add({ action: "image.upload", name: image.name.slice(0, 200), actorUid: account.uid, actorEmail: account.email ?? "", createdAt: Timestamp.now() });
    return NextResponse.json({ url }, { status: 201, headers: adminHeaders });
  } catch (error) { return adminFailure(error); }
}
