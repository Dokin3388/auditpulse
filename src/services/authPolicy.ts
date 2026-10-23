export const AUTHORIZED_LOGIN_ROLES = ['HEAD_AUDITOR', 'AUDITOR', 'ADMIN'] as const;

export type AuthorizedLoginRole = (typeof AUTHORIZED_LOGIN_ROLES)[number];

export function isLoginAllowedRole(role?: string | null): boolean {
  return typeof role === 'string' && AUTHORIZED_LOGIN_ROLES.includes(role as AuthorizedLoginRole);
}

export function getLoginGateFailure({
  role,
  loginEnabled,
  isActive,
}: {
  role?: string | null;
  loginEnabled?: boolean | null;
  isActive?: boolean | null;
}): string | null {
  if (role === 'SALE') {
    return 'SALE không được sử dụng webapp AuditPulse.';
  }

  if (!role) {
    return 'Tài khoản chưa được cấp quyền AuditPulse.';
  }

  if (!isLoginAllowedRole(role)) {
    return 'Tài khoản này không có quyền đăng nhập AuditPulse.';
  }

  if (loginEnabled === false) {
    return 'Tài khoản này đã bị vô hiệu hóa đăng nhập.';
  }

  if (isActive === false) {
    return 'Tài khoản này không hoạt động.';
  }

  return null;
}
