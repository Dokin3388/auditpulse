import test from 'node:test';
import assert from 'node:assert/strict';

import { getLoginGateFailure, isLoginAllowedRole } from '../authPolicy.ts';

test('Allowed roles can sign in', () => {
  assert.equal(isLoginAllowedRole('HEAD_AUDITOR'), true);
  assert.equal(isLoginAllowedRole('AUDITOR'), true);
  assert.equal(isLoginAllowedRole('ADMIN'), true);
  assert.equal(isLoginAllowedRole('SALE'), false);
});

test('Sale accounts and disabled login accounts are blocked', () => {
  assert.equal(
    getLoginGateFailure({ role: 'SALE', loginEnabled: true, isActive: true }),
    'SALE không được sử dụng webapp AuditPulse.'
  );

  assert.equal(
    getLoginGateFailure({ role: 'AUDITOR', loginEnabled: false, isActive: true }),
    'Tài khoản này đã bị vô hiệu hóa đăng nhập.'
  );

  assert.equal(
    getLoginGateFailure({ role: 'AUDITOR', loginEnabled: true, isActive: false }),
    'Tài khoản này không hoạt động.'
  );
});
