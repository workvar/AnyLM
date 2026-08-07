// Role hierarchy for organization members.
export const ROLES = ["member", "manager", "admin", "owner"] as const;
export type Role = (typeof ROLES)[number];

const rank: Record<string, number> = { member: 0, manager: 1, admin: 2, owner: 3 };

export function atLeast(role: string, min: Role): boolean {
  return (rank[role] ?? -1) >= rank[min];
}

// Managers can edit policies and view usage; admins also manage members,
// limits, and pricing; owners can delete the org and transfer ownership.
export const CAN_MANAGE_POLICIES: Role = "manager";
export const CAN_MANAGE_MEMBERS: Role = "admin";
