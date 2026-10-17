import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, cert, deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

export async function sha256File(filename) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(filename)) hash.update(bytes);
  return hash.digest('hex');
}

export async function exportFirestore({ request, root, readTime, onDocument }) {
  const counts = {};
  const resource = name => name.split('/').map(encodeURIComponent).join('/');
  async function visit(parent) {
    let token;
    do {
      const page = await request(`${resource(parent)}:listCollectionIds`, {
        method: 'POST', body: { pageSize: 100, readTime, ...(token ? { pageToken: token } : {}) },
      });
      for (const collectionId of page.collectionIds ?? []) {
        let documentToken;
        do {
          const query = new URLSearchParams({ pageSize: '200', showMissing: 'true', readTime });
          if (documentToken) query.set('pageToken', documentToken);
          const documents = await request(`${resource(parent)}/${encodeURIComponent(collectionId)}?${query}`);
          const records = documents.documents ?? [];
          for (const document of records) {
            if (!document.name?.startsWith(`${root}/`)) throw new Error('Unexpected Firestore document resource.');
            // Missing parent documents still carry subcollections and must be traversed.
            if (document.updateTime) {
              await onDocument(document);
              counts[collectionId] = (counts[collectionId] ?? 0) + 1;
            }
          }
          for (let index = 0; index < records.length; index += 8) {
            await Promise.all(records.slice(index, index + 8).map(document => visit(document.name)));
          }
          documentToken = documents.nextPageToken;
        } while (documentToken);
      }
      token = page.nextPageToken;
    } while (token);
  }
  await visit(root);
  return counts;
}

export async function exportFirebase({ output, projectId, databaseId = '(default)', bucketName, includeAuth = false, includeStorage = false }) {
  if (!/^[a-z][a-z0-9-]+$/.test(projectId ?? '')) throw new Error('Specify a valid Firebase project ID.');
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    throw new Error('Remove emulator variables before a real export; do not mix data sources.');
  }
  if (includeStorage && !bucketName) throw new Error('Specify the source Storage bucket.');
  await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  await mkdir(output, { mode: 0o700 });
  const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) : applicationDefault();
  const app = initializeApp({ credential, projectId }, `migration-${Date.now()}`);
  const startedAt = new Date().toISOString();
  // A whole-second historical read provides one consistent Firestore snapshot.
  const readTime = new Date(Math.floor(Date.now() / 1000) * 1000 - 5000).toISOString();
  const files = {};
  const writers = [];
  async function writer(filename) {
    const handle = await open(path.join(output, filename), 'wx', 0o600);
    writers.push(handle);
    let pending = Promise.resolve();
    let count = 0;
    return {
      append(record) { count++; pending = pending.then(() => handle.writeFile(`${JSON.stringify(record)}\n`)); return pending; },
      async finish() { await pending; await handle.sync(); files[filename] = { records: count, sha256: await sha256File(path.join(output, filename)) }; },
    };
  }
  try {
    let tokenPromise;
    let tokenExpiresAt = 0;
    async function accessToken() {
      if (!tokenPromise || Date.now() >= tokenExpiresAt) {
        tokenPromise = credential.getAccessToken().then(token => {
          tokenExpiresAt = Date.now() + Math.max(0, token.expires_in - 60) * 1000;
          return token.access_token;
        });
      }
      return tokenPromise;
    }
    const request = async (resource, options = {}) => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const token = await accessToken();
        const response = await fetch(`https://firestore.googleapis.com/v1/${resource}`, {
          method: options.method ?? 'GET',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(60000),
        });
        if (response.ok) return response.json();
        if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) {
          // Never log returned documents or authorization details.
          throw new Error(`Firestore export request failed (HTTP ${response.status}).`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
      }
    };
    const documents = await writer('firestore.ndjson');
    const counts = await exportFirestore({ request, root: `projects/${projectId}/databases/${databaseId}/documents`, readTime, onDocument: document => documents.append(document) });
    await documents.finish();
    if (includeAuth) {
      const accounts = await writer('auth.ndjson');
      let pageToken;
      do {
        const page = await getAuth(app).listUsers(1000, pageToken);
        for (const user of page.users) await accounts.append(user.toJSON());
        pageToken = page.pageToken;
      } while (pageToken);
      await accounts.finish();
    }
    if (includeStorage) {
      await mkdir(path.join(output, 'blobs'), { mode: 0o700 });
      const objects = await writer('storage.ndjson');
      const bucket = getStorage(app).bucket(bucketName);
      let query = { autoPaginate: false, maxResults: 200, versions: true };
      do {
        const [page, next] = await bucket.getFiles(query);
        for (const file of page) {
          const [metadata] = await file.getMetadata();
          const key = createHash('sha256').update(`${bucketName}\0${file.name}\0${metadata.generation}`).digest('hex');
          const relativePath = `blobs/${key}.bin`;
          await file.download({ destination: path.join(output, relativePath) });
          const sha256 = await sha256File(path.join(output, relativePath));
          await objects.append({ bucket: bucketName, name: file.name, generation: metadata.generation, relativePath, sha256, metadata });
        }
        query = next;
      } while (query);
      await objects.finish();
    }
    const manifest = { format: 'comparacel-firebase-v1', projectId, databaseId, bucketName: includeStorage ? bucketName : null, startedAt, completedAt: new Date().toISOString(), readTime, counts, files };
    // A manifest is only written once every requested service completed successfully.
    await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return manifest;
  } finally {
    await Promise.allSettled(writers.map(handle => handle.close()));
    await deleteApp(app);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = flag => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
  if (!value('--output') || !value('--project')) {
    console.error('Usage: node --env-file=.env.local scripts/export-firebase.mjs --project PROJECT --output PRIVATE_DIRECTORY [--database ID] [--auth] [--storage --bucket BUCKET]');
    process.exitCode = 1;
  } else {
    exportFirebase({ output: path.resolve(value('--output')), projectId: value('--project'), databaseId: value('--database') ?? '(default)', includeAuth: args.includes('--auth'), includeStorage: args.includes('--storage'), bucketName: value('--bucket') ?? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET })
      .then(manifest => console.log(JSON.stringify({ completed: true, collections: manifest.counts, files: Object.fromEntries(Object.entries(manifest.files).map(([name,file])=>[name,file.records])) })))
      .catch(error => { console.error(`Export failed: ${error.message}`); process.exitCode = 1; });
  }
}
