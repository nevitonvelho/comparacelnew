import { AdminError } from "./admin-model";
export const permissionLabels = {
  "products.view": "Ver produtos", "products.create": "Cadastrar produtos", "products.edit": "Editar produtos e ofertas",
  "import.manage": "Importar produtos", "categories.manage": "Gerenciar categorias e home",
  "brands.manage": "Cadastrar marcas", "stores.manage": "Cadastrar lojas", "audit.view": "Ver histórico de atividade",
} as const;
export type Permission = keyof typeof permissionLabels;
export type AccessRole = "user" | "employee" | "administrator";
export type StaffAccess = { role: AccessRole; permissions: Permission[]; owner: boolean };
export function validateStaffAccess(value: unknown): { role: AccessRole; permissions: Permission[] } {
  if (!value || typeof value !== "object") throw new AdminError("Confira o perfil de acesso.");
  const data = value as Record<string, unknown>;
  if (!["user","employee","administrator"].includes(String(data.role)) || !Array.isArray(data.permissions) || data.permissions.some(item=>typeof item!=="string" || !Object.hasOwn(permissionLabels,item))) throw new AdminError("Perfil ou permissão inválida.");
  const role = data.role as AccessRole;
  const permissions = role === "administrator" ? Object.keys(permissionLabels) as Permission[] : role === "user" ? [] : [...new Set(data.permissions)] as Permission[];
  if (permissions.some(item=>["products.create","products.edit","import.manage"].includes(item)) && !permissions.includes("products.view")) permissions.push("products.view");
  return {role,permissions};
}
