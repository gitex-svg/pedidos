import type { User } from "@workspace/db";

export function publicUser(user: User, representativeId: string | null = null) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    representative_id: representativeId,
  };
}