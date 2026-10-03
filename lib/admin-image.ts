import sharp from "sharp";
import { AdminError } from "./admin-model";
export const MAX_ADMIN_IMAGE_SIZE = 5 * 1024 * 1024;
export async function inspectAdminImage(bytes: Buffer, type: string) {
  const formats: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  const png = bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!bytes.length || bytes.length > MAX_ADMIN_IMAGE_SIZE) throw new AdminError("Escolha uma imagem de até 5 MB.");
  if (!(png && type === "image/png" || jpeg && type === "image/jpeg" || webp && type === "image/webp")) throw new AdminError("Use uma imagem válida em JPG, PNG ou WebP.");
  let info;
  try { info = await sharp(bytes, { limitInputPixels: 16000000 }).metadata(); }
  catch { throw new AdminError("Não foi possível ler essa imagem."); }
  if (!info.format || formats[info.format] !== type || !info.width || !info.height || info.width > 5000 || info.height > 5000 || (info.pages ?? 1) > 1) throw new AdminError("Use uma imagem estática válida, de até 5.000 pixels por lado.");
  return { extension: info.format === "jpeg" ? "jpg" : info.format };
}
