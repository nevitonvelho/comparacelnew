import { addDoc, collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDatabase } from "./firebase/client";
import type { Product } from "./product-model";

export type PublicProfile = { uid: string; displayName: string; bio: string; photoURL: string | null };
export type SocialPost = { id: string; authorUid: string; authorName: string; authorPhoto: string | null; title: string; opinion: string; productIds: string[]; category: string; winner: string; createdAt: number };
export function googlePhoto(value: unknown): string | null { return typeof value === "string" && /^https:\/\/lh3\.googleusercontent\.com\//.test(value) ? value : null; }
export async function saveProfile(uid: string, values: { displayName: string; bio: string; photoURL: string | null }) {
  const name=values.displayName.trim();
  if (!name || name.length > 60 || values.bio.length > 280) throw new Error("Preencha um nome de até 60 caracteres e uma bio de até 280.");
  await setDoc(doc(getDatabase(),"profiles",uid),{displayName:name,bio:values.bio.trim(),photoURL:googlePhoto(values.photoURL),updatedAt:serverTimestamp()});
}
export async function publishComparison(uid: string, pair: Product[], title: string, opinion: string, winner: string) {
  if (pair.length !== 2 || pair[0].id === pair[1].id || pair[0].category !== pair[1].category) throw new Error("Escolha dois produtos diferentes da mesma categoria.");
  if (title.trim().length < 5 || title.trim().length > 100 || opinion.trim().length < 20 || opinion.trim().length > 3000) throw new Error("Preencha um título de 5 a 100 caracteres e uma opinião de 20 a 3.000 caracteres.");
  const profile=await getDoc(doc(getDatabase(),"profiles",uid));
  if (!profile.exists()) throw new Error("Crie seu perfil público antes de publicar.");
  const ids=pair.map(product=>product.id).sort();
  if (!ids.includes(winner) && !["tie","undecided"].includes(winner)) throw new Error("Escolha uma preferência válida.");
  const reference=await addDoc(collection(getDatabase(),"socialPosts"),{authorUid:uid,authorName:profile.data().displayName,authorPhoto:profile.data().photoURL,title:title.trim(),opinion:opinion.trim(),productIds:ids,category:pair[0].category,winner,status:"published",createdAt:serverTimestamp()});
  return reference.id;
}
export function removePublication(id: string) { return deleteDoc(doc(getDatabase(),"socialPosts",id)); }
