import "server-only";
import { backendRequest } from "./laravel-api";

class ImageFile {
  url?: string;
  constructor(readonly name: string) {}
  async save(bytes: Buffer, options: { metadata: { contentType: string; [key: string]: unknown }; [key: string]: unknown }) {
    const result = await backendRequest<{ url: string }>("upload", { name: this.name, contentType: options.metadata.contentType, bytes: bytes.toString("base64") });
    this.url = result.url;
  }
}
export function getLaravelBucket() { return { file: (name: string) => new ImageFile(name) }; }
export async function getDownloadURL(file: ImageFile) { if (!file.url) throw new Error("Image upload not completed"); return file.url; }
