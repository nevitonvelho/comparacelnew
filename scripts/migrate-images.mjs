import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getDownloadURL, getStorage } from 'firebase-admin/storage';

const source = new URL(process.env.DJANGO_MEDIA_ORIGIN ?? 'https://comparacel.com.br');
const cacheRoot = resolve('data/media');
const rows = JSON.parse(await readFile('data/django-export.json', 'utf8'));
const products = rows.filter(row => row.model === 'products.product' && row.fields.image);
const upload = process.argv.includes('--upload');
const maximumSize = 15 * 1024 * 1024;
const manifest = [];
const errors = [];
let completed = 0;

function contentType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())) return 'image/gif';
  if (bytes.subarray(4, 8).toString() === 'ftyp' && /avif|avis/.test(bytes.subarray(8, 32).toString())) return 'image/avif';
  throw new Error('Formato de imagem não reconhecido');
}

let bucket;
let db;
if (upload) {
  initializeApp({ credential: applicationDefault(), projectId: 'comparacel', storageBucket: 'comparacel.firebasestorage.app' });
  bucket = getStorage().bucket();
  const [exists] = await bucket.exists();
  if (!exists) throw new Error('Crie o Firebase Storage no console antes de executar --upload.');
  db = getFirestore();
}

async function migrate(product) {
  const path = product.fields.image;
  if (!path.startsWith('products/') || path.split('/').some(part => !part || part === '.' || part === '..') || path.includes('\\')) throw new Error('Caminho de imagem inválido');
  const local = resolve(cacheRoot, path);
  if (!local.startsWith(cacheRoot + sep)) throw new Error('Caminho fora do cache');
  let bytes;
  try { bytes = await readFile(local); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const url = new URL(`/media/${path.split('/').map(encodeURIComponent).join('/')}`, source);
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Origem HTTP ${response.status}`);
    if (!response.headers.get('content-type')?.startsWith('image/')) throw new Error('Origem não retornou uma imagem');
    if (Number(response.headers.get('content-length')) > maximumSize) throw new Error('Imagem excede 15 MB');
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maximumSize) throw new Error('Imagem excede 15 MB');
      chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks);
    contentType(bytes);
    await mkdir(dirname(local), { recursive: true });
    await writeFile(local, bytes);
  }
  if (bytes.length > maximumSize) throw new Error('Imagem excede 15 MB');
  const type = contentType(bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const entry = { productId: product.fields.slug, path, bytes: bytes.length, contentType: type, sha256 };
  if (upload) {
    const file = bucket.file(path);
    try {
      await file.save(bytes, {
        resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { contentType: type, cacheControl: 'public,max-age=86400', metadata: { firebaseStorageDownloadTokens: randomUUID(), sha256 } },
      });
    } catch (error) {
      if (Number(error.code) !== 412) throw error;
      const [metadata] = await file.getMetadata();
      if (metadata.metadata?.sha256 !== sha256) throw new Error('Arquivo existente difere da origem; não foi sobrescrito');
    }
    const imageUrl = await getDownloadURL(file);
    // Preserve every other product field; update only the migrated image reference.
    await db.collection('products').doc(product.fields.slug).update({ imageUrl, imageStoragePath: path });
    entry.imageUrl = imageUrl;
  }
  manifest.push(entry);
}

const queue = [...products];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const product = queue.shift();
    try { await migrate(product); }
    catch (error) { errors.push({ productId: product.fields.slug, error: error.message }); }
    completed++;
    if (completed % 25 === 0 || completed === products.length) console.log(`${completed}/${products.length} processadas; ${errors.length} falhas`);
  }
}));
await mkdir('data', { recursive: true });
await writeFile('data/images-manifest.json', JSON.stringify({ uploaded: upload, images: manifest, errors }, null, 2));
console.log(`${manifest.length} imagens ${upload ? 'enviadas e vinculadas' : 'baixadas e validadas'}. ${errors.length} falhas.`);
if (errors.length) { console.log(errors); process.exitCode = 1; }
