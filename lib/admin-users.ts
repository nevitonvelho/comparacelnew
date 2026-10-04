import "server-only";
import { getAdminAuth, getAdminDatabase } from "./firebase/admin";
import { isAdministrator, AdminError } from "./admin-model";
import { validateStaffAccess, type AccessRole, type Permission } from "./admin-permissions";
export type ManagedUser = { uid:string; email:string; name:string; disabled:boolean; owner:boolean; role:AccessRole; permissions:Permission[]; createdAt:string; lastSignIn:string };
export async function readAdminUsers() {
  const access=await getAdminDatabase().collection("adminUserAccess").get();
  const roles=new Map(access.docs.map(doc=>[doc.id,doc.data()]));
  const users:ManagedUser[]=[];
  let pageToken:string|undefined;
  do {
    const page=await getAdminAuth().listUsers(1000,pageToken);
    for(const user of page.users) {
      const owner=isAdministrator({uid:user.uid,email:user.email,email_verified:user.emailVerified,admin:user.customClaims?.admin,firebase:{sign_in_provider:user.providerData.some(provider=>provider.providerId==="google.com")?"google.com":""}},process.env.ADMIN_EMAILS ?? "");
      const stored=roles.get(user.uid);
      const role:AccessRole=owner || stored?.role==="administrator" ? "administrator" : stored?.role==="employee" ? "employee":"user";
      const permissions=stored?.permissions ?? [];
      users.push({uid:user.uid,email:user.email ?? "",name:user.displayName ?? "Sem nome",disabled:user.disabled,owner,role,permissions,createdAt:user.metadata.creationTime,lastSignIn:user.metadata.lastSignInTime ?? ""});
    }
    pageToken=page.pageToken;
  } while(pageToken);
  return users.sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
}
export async function saveUserAccess(actor:{uid:string;email?:string}, value:unknown) {
  const data=value as {uid?:unknown};
  if(!data || typeof data.uid!=="string" || !data.uid || data.uid.includes("/") || data.uid.length>128) throw new AdminError("Usuário inválido.");
  if(data.uid===actor.uid) throw new AdminError("Você não pode alterar seu próprio acesso.",403);
  const user=await getAdminAuth().getUser(data.uid);
  const owner=user.customClaims?.admin===true || (process.env.ADMIN_EMAILS ?? "").split(",").map(email=>email.trim().toLowerCase()).includes((user.email ?? "").toLowerCase());
  if(owner) throw new AdminError("O acesso deste administrador é definido na configuração do servidor.",403);
  const access=validateStaffAccess(value);
  if(access.role!=="user" && (!user.emailVerified || !user.providerData.some(provider=>provider.providerId==="google.com"))) throw new AdminError("O funcionário precisa ter uma conta Google verificada.");
  const db=getAdminDatabase();const batch=db.batch();
  batch.set(db.doc(`adminUserAccess/${user.uid}`),{...access,updatedAt:new Date(),updatedBy:actor.uid});
  batch.create(db.collection("adminAudit").doc(),{action:"users.access",name:user.email ?? user.displayName ?? user.uid,actorUid:actor.uid,actorEmail:actor.email ?? "",createdAt:new Date()});
  await batch.commit();
}
