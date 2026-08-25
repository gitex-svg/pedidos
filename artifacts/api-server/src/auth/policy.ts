import type { User } from "@workspace/db";

export type AppRole = User["role"];

export function hasRole(userRole: AppRole, allowedRoles: readonly AppRole[]) {
  return allowedRoles.includes(userRole);
}