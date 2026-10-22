import assert from 'node:assert/strict';
import test from 'node:test';
import {
  googleSheetAmount,
  googleSheetSourceRowKey,
  normalizeGoogleSheetHeader,
  primaryGoogleSheetPhone,
  stableGoogleSheetHash,
  toGoogleSheetRow,
} from '../../../server/services/googleSheetsWebhook.ts';

test('Google Sheets webhook: normalizes Vietnamese headers and row cells', () => {
  const row = toGoogleSheetRow([' Số điện thoại ', 'Tên KH', 'Mã khách hàng'], ['0901 234 567', 'Khách A', 'C-01']);
  assert.deepEqual(row, { so_dien_thoai: '0901 234 567', ten_kh: 'Khách A', ma_khach_hang: 'C-01' });
  assert.equal(normalizeGoogleSheetHeader('Ngày chứng từ'), 'ngay_chung_tu');
});

test('Google Sheets webhook: derives stable deduplication keys', () => {
  assert.equal(googleSheetSourceRowKey('data_sale', { id_sale: 'S-01' }, 7), 'S-01');
  assert.equal(googleSheetSourceRowKey('TongHopKhachHang', { so_dien_thoai: '0901' }, 7), '0901');
  assert.equal(googleSheetSourceRowKey('fact_issue_log', { date: '2026-10-20', sale: 'S-01', sdt: '0901', issue_code: 'I-01', legacy_code: '' }, 7), '2026-10-20|S-01|0901|I-01|');
  assert.equal(googleSheetSourceRowKey('unknown', {}, 7), 'unknown:7');
});

test('Google Sheets webhook: has deterministic row hashes and parses VND', () => {
  assert.equal(stableGoogleSheetHash({ a: '1' }), stableGoogleSheetHash({ a: '1' }));
  assert.equal(googleSheetAmount('1.250.000 ₫'), 1250000);
});

test('Google Sheets webhook: selects one primary phone from legacy contact lists', () => {
  assert.equal(primaryGoogleSheetPhone('0901\n0902\n0903'), '0901');
  assert.equal(primaryGoogleSheetPhone('0901'), '0901');
  assert.equal(primaryGoogleSheetPhone(''), null);
});
