import React, { useEffect, useState } from 'react';
import { LockKeyhole, LogIn } from 'lucide-react';
import { getCurrentIdentity, requestPasswordReset, resetPassword, signInEmail, type AppIdentity } from '../services/auth';

interface AuthGateProps {
  children: (identity: AppIdentity) => React.ReactNode;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const [identity, setIdentity] = useState<AppIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('ngandoan.jobup@gmail.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => {
    getCurrentIdentity().then(setIdentity).catch(() => setIdentity(null)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-200">Đang kiểm tra phiên đăng nhập…</div>;
  if (identity) return <>{children(identity)}</>;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInEmail(email.trim(), password);
      const nextIdentity = await getCurrentIdentity();
      if (!nextIdentity) throw new Error('Tài khoản chưa được cấp quyền AuditPulse.');
      setIdentity(nextIdentity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đăng nhập.');
    } finally {
      setBusy(false);
    }
  };

  const submitForgot = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { setError(await requestPasswordReset(email.trim())); }
    catch (err) { setError(err instanceof Error ? err.message : 'Không thể gửi email.'); }
    finally { setBusy(false); }
  };

  const submitReset = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { setError(await resetPassword(resetToken, password)); setResetDone(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Không thể đặt lại mật khẩu.'); }
    finally { setBusy(false); }
  };

  if (resetToken) return <div className="min-h-screen grid place-items-center bg-slate-950 px-4 text-slate-100"><form onSubmit={submitReset} className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl"><h1 className="mb-2 text-2xl font-semibold">Đặt lại mật khẩu</h1><p className="mb-6 text-sm text-slate-400">Liên kết có hiệu lực trong 30 phút.</p><label className="mb-4 block text-sm">Mật khẩu mới<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" required /></label>{error && <p className="mb-4 rounded-lg bg-cyan-500/10 px-3 py-2 text-sm text-cyan-300">{error}</p>}<button disabled={busy || resetDone} className="w-full rounded-lg bg-cyan-500 px-4 py-2.5 font-medium text-slate-950 disabled:opacity-60">{resetDone ? 'Đã xử lý' : 'Đặt lại mật khẩu'}</button></form></div>;

  if (forgot) return <div className="min-h-screen grid place-items-center bg-slate-950 px-4 text-slate-100"><form onSubmit={submitForgot} className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl"><h1 className="mb-2 text-2xl font-semibold">Quên mật khẩu</h1><p className="mb-6 text-sm text-slate-400">Nhập email AuditPulse để nhận liên kết đặt lại mật khẩu.</p><label className="mb-4 block text-sm">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" required /></label>{error && <p className="mb-4 rounded-lg bg-cyan-500/10 px-3 py-2 text-sm text-cyan-300">{error}</p>}<button disabled={busy} className="w-full rounded-lg bg-cyan-500 px-4 py-2.5 font-medium text-slate-950 disabled:opacity-60">{busy ? 'Đang gửi…' : 'Gửi liên kết'}</button><button type="button" onClick={() => { setForgot(false); setError(''); }} className="mt-4 w-full text-sm text-slate-400">Quay lại đăng nhập</button></form></div>;

  return (
    <div className="min-h-screen grid place-items-center bg-slate-950 px-4 text-slate-100">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="rounded-xl bg-cyan-500/15 p-3 text-cyan-300"><LockKeyhole size={22} /></div>
          <div><p className="text-xl font-semibold">AuditPulse</p><p className="text-sm text-slate-400">Sale Operation Audit System</p></div>
        </div>
        <h1 className="mb-2 text-2xl font-semibold">Đăng nhập</h1>
        <p className="mb-6 text-sm text-slate-400">Dùng tài khoản AuditPulse đã được Head Auditor cấp quyền.</p>
        <label className="mb-4 block text-sm">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" required /></label>
        <label className="mb-4 block text-sm">Mật khẩu<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" minLength={8} required /></label>
        {error && <p className="mb-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 font-medium text-slate-950 disabled:opacity-60"><LogIn size={17} />{busy ? 'Đang xử lý…' : 'Đăng nhập'}</button>
        <button type="button" onClick={() => { setForgot(true); setError(''); }} className="mt-4 w-full text-center text-xs text-slate-400 hover:text-cyan-300">Quên mật khẩu?</button>
      </form>
    </div>
  );
};
