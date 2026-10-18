/**
 * Phiên đăng nhập phía trình duyệt: access token do POST /v1/auth/login cấp.
 * Token lưu localStorage để gửi kèm header Authorization; hết hạn thì coi như đăng xuất.
 */
export interface SessionUser {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
}

export interface Session {
  token: string;
  expiresAt: string;
  user: SessionUser;
}

const SESSION_KEY = "agos.session";
const WORKSPACE_KEY = "agos.workspace";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  const raw = storage()?.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Session;
    if (!session.token || new Date(session.expiresAt).getTime() <= Date.now()) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    clearSession();
    return null;
  }
}

export function saveSession(session: Session): void {
  storage()?.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  storage()?.removeItem(SESSION_KEY);
}

export function getSelectedWorkspaceId(): string | null {
  return storage()?.getItem(WORKSPACE_KEY) ?? null;
}

export function setSelectedWorkspaceId(id: string): void {
  storage()?.setItem(WORKSPACE_KEY, id);
}
