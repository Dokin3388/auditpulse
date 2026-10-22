export interface AuthUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export interface AppIdentity {
  session: { id: string; expiresAt: string };
  user: AuthUser;
  appUser: { id: string; name: string; email: string; role: string; avatarUrl?: string | null };
}

async function authRequest(path: string, body?: unknown): Promise<Response> {
  return fetch(`/api/auth${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function getCurrentIdentity(): Promise<AppIdentity | null> {
  const response = await fetch('/api/me', { credentials: 'include' });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('Không thể kiểm tra phiên đăng nhập.');
  return (await response.json()) as AppIdentity;
}

export async function signInEmail(email: string, password: string): Promise<void> {
  const response = await authRequest('/sign-in/email', { email, password, rememberMe: true });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
    throw new Error(payload?.message || payload?.error || 'Email hoặc mật khẩu không đúng.');
  }
}

export async function signUpEmail(name: string, email: string, password: string): Promise<void> {
  const response = await authRequest('/sign-up/email', { name, email, password });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
    throw new Error(payload?.message || payload?.error || 'Không thể tạo tài khoản.');
  }
}

export async function signOut(): Promise<void> {
  await authRequest('/sign-out', {});
}
