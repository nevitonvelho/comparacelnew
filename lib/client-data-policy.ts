import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { AdminError } from "./admin-model";
import { googlePhoto } from "./social-values";

type Reference = { type: "document" | "query"; path: string; constraints?: { field?: string; operator?: string; value?: unknown; direction?: string; maximum?: number }[] };
type Input = { action: string; reference: Reference; references?: Reference[]; data?: Record<string, unknown> };
type Identity = { uid: string } | null;
const libraries = ["likedProducts", "likedComparisons", "savedComparisons"];
function valid(condition: unknown, message = "Pedido inválido.", status = 400): asserts condition { if (!condition) throw new AdminError(message, status); }
const safeId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9:_-]{1,400}$/.test(value);

export async function executeClientData(db: Firestore, identity: Identity, input: Input) {
  valid(input && ["read", "readMany", "set", "create", "delete"].includes(input.action));
  if (input.action === "readMany") {
    valid(Array.isArray(input.references) && input.references.length > 0 && input.references.length <= 100);
    const paths = input.references.map(reference => {
      valid(reference?.type === "document" && typeof reference.path === "string" && /^(profiles|reactionStats)\/[a-zA-Z0-9:_-]{1,400}$/.test(reference.path), "Acesso não permitido.", 403);
      return reference.path;
    });
    const records = await db.getAll(...paths.map(path => db.doc(path)), { fieldMask: ["displayName", "bio", "photoURL", "counts", "total"] });
    return { documents: records.map((record, index) => ({ path: paths[index], data: record.exists ? paths[index].startsWith("profiles/") ? { displayName: record.data()!.displayName, bio: record.data()!.bio, photoURL: googlePhoto(record.data()!.photoURL) } : { counts: record.data()!.counts, total: record.data()!.total } : null })) };
  }
  const { action, reference, data = {} } = input;
  valid(reference && ["document", "query"].includes(reference.type) && typeof reference.path === "string");
  const parts = reference.path.split("/");
  valid(parts.every(safeId) && parts.length <= 4);
  const [root, id, kind] = parts;
  const own = root === "users" && identity?.uid === id;
  const library = own && libraries.includes(kind);
  if (action === "read") {
    if (reference.type === "document") {
      valid(parts.length === 2 && ["profiles", "socialPosts", "reactionStats"].includes(root) || parts.length === 4 && own && [...libraries, "reactions"].includes(kind), "Acesso não permitido.", 403);
      const snapshot = await db.doc(reference.path).get();
      let value = snapshot.data();
      if (root === "socialPosts" && value?.status !== "published") value = undefined;
      if (root === "profiles" && value) value = { displayName: value.displayName, bio: value.bio, photoURL: googlePhoto(value.photoURL) };
      if (root === "reactionStats" && value) value = { counts: value.counts, total: value.total };
      return { documents: [{ path: reference.path, data: value ?? null }] };
    }
    valid(root === "socialPosts" && parts.length === 1 || parts.length === 3 && own && [...libraries, "reactions"].includes(kind), "Acesso não permitido.", 403);
    let query: FirebaseFirestore.Query = db.collection(reference.path);
    if (root === "socialPosts") {
      query = query.where("status", "==", "published");
      const constraints = reference.constraints ?? [];
      valid(Array.isArray(constraints) && constraints.length <= 6);
      for (const constraint of constraints) {
        if (constraint.operator) {
          valid(["status", "category", "authorUid"].includes(constraint.field ?? "") && constraint.operator === "==" && typeof constraint.value === "string" && constraint.value.length <= 128);
          if (constraint.field === "status") valid(constraint.value === "published");
          else query = query.where(constraint.field!, "==", constraint.value);
        }
      }
      const count = constraints.find(constraint => constraint.maximum !== undefined)?.maximum ?? 20;
      valid(Number.isInteger(count) && count >= 1 && count <= 100);
      query = query.orderBy("createdAt", "desc").limit(count);
    } else {
      query = query.limit(10000);
    }
    const result = await query.get();
    return { documents: result.docs.map(document => ({ path: document.ref.path, data: document.data() })) };
  }
  valid(identity, "Entre com Google para continuar.", 401);
  valid(data && typeof data === "object" && !Array.isArray(data));
  valid(reference.type === "document");
  valid(library && parts.length === 4 && ["set", "delete"].includes(action)
    || root === "profiles" && parts.length === 2 && id === identity.uid && action === "set"
    || root === "socialPosts" && parts.length === 2 && ["create", "delete"].includes(action), "Acesso não permitido.", 403);
  const ref = db.doc(reference.path);
  const now = Timestamp.now();
  if (library && parts.length === 4 && ["set", "delete"].includes(action)) {
    if (action === "delete") { await ref.delete(); return { documents: [] }; }
    const ids = kind === "likedProducts" ? [data.productId] : data.productIds;
    valid(Array.isArray(ids) && ids.length === (kind === "likedProducts" ? 1 : 2) && ids.every(safeId) && new Set(ids).size === ids.length);
    const sorted = [...ids].sort();
    valid(parts[3] === sorted.join("-vs-"));
    await db.runTransaction(async tx => {
      const products = await tx.getAll(...sorted.map(product => db.doc(`products/${product}`)), { fieldMask: ["isActive", "categorySlug"] });
      valid(products.every(product => product.data()?.isActive === true) && (products.length === 1 || products[0].data()?.categorySlug === products[1].data()?.categorySlug), "Produto indisponível.", 404);
      tx.set(ref, { ...(kind === "likedProducts" ? { productId: sorted[0] } : { productIds: sorted }), createdAt: now });
    });
    return { documents: [] };
  }
  if (root === "profiles" && parts.length === 2 && id === identity.uid && action === "set") {
    valid(typeof data.displayName === "string" && data.displayName.trim().length > 0 && data.displayName.trim().length <= 60 && typeof data.bio === "string" && data.bio.length <= 280);
    await ref.set({ displayName: data.displayName.trim(), bio: data.bio.trim(), photoURL: googlePhoto(data.photoURL), updatedAt: now });
    return { documents: [] };
  }
  if (root === "socialPosts" && parts.length === 2) {
    if (action === "delete") {
      await db.runTransaction(async tx => { const post = await tx.get(ref); valid(post.data()?.authorUid === identity.uid, "Acesso não permitido.", 403); tx.delete(ref); });
      return { documents: [] };
    }
    valid(action === "create" && typeof data.title === "string" && data.title.trim().length >= 5 && data.title.trim().length <= 100 && typeof data.opinion === "string" && data.opinion.trim().length >= 20 && data.opinion.trim().length <= 3000);
    valid(Array.isArray(data.productIds) && data.productIds.length === 2 && data.productIds.every(safeId) && data.productIds[0] !== data.productIds[1]);
    const ids = [...data.productIds].sort();
    valid(typeof data.winner === "string" && [...ids, "tie", "undecided"].includes(data.winner));
    await db.runTransaction(async tx => {
      const [profile, ...products] = await tx.getAll(db.doc(`profiles/${identity.uid}`), ...ids.map(product => db.doc(`products/${product}`)));
      valid(profile.exists, "Crie seu perfil público antes de publicar.");
      valid(products.every(product => product.data()?.isActive === true) && products[0].data()?.categorySlug === products[1].data()?.categorySlug, "Produtos indisponíveis.", 404);
      tx.create(ref, { authorUid: identity.uid, authorName: profile.data()!.displayName, authorPhoto: googlePhoto(profile.data()!.photoURL), title: (data.title as string).trim(), opinion: (data.opinion as string).trim(), productIds: ids, category: products[0].data()!.categorySlug, winner: data.winner, status: "published", createdAt: now });
    });
    return { documents: [] };
  }
  throw new AdminError("Acesso não permitido.", 403);
}
