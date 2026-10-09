export type RoleType = "Owner" | "Editor" | "Viewer";

export interface MemberItem {
  id: string;
  name: string;
  isYou?: boolean;
  subtitle: string;
  email: string;
  role: RoleType;
  status: "Active" | "Pending" | "Inactive";
  joined: string;
  avatarBg: string;
  initials: string;
}

export interface NewMemberPayload {
  name: string;
  email: string;
  role: RoleType;
  subtitle?: string;
}
