import React, { useEffect, useState } from 'react';
import { LockKeyhole, LogIn } from 'lucide-react';
import { getCurrentIdentity, signInEmail, signUpEmail, type AppIdentity } from '../services/auth';

interface AuthGateProps {
  children: (identity: AppIdentity) => React.ReactNode;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const [identity, setIdentity] = useState<AppIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState('Ngân Đoàn');
  const [email, setEmail] = useState('ngandoan.jobup@gmail.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
      if (isSignup) await signUpEmail(name.trim(), email.trim(), password);
      else await signInEmail(email.trim(), password);
      const nextIdentity = await getCurrentIdentity();
      if (!nextIdentity) throw new Error('Tài khoản chưa được cấp quyền AuditPulse.');
      setIdentity(nextIdentity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đăng nhập.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-slate-950 px-4 text-slate-100">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="rounded-xl bg-cyan-500/15 p-3 text-cyan-300"><LockKeyhole size={22} /></div>
          <div><p className="text-xl font-semibold">AuditPulse</p><p className="text-sm text-slate-400">Sale Operation Audit System</p></div>
        </div>
        <h1 className="mb-2 text-2xl font-semibold">{isSignup ? 'Tạo tài khoản quản trị' : 'Đăng nhập'}</h1>
        <p className="mb-6 text-sm text-slate-400">Tài khoản đầu tiên dùng email đã được cấp quyền Head Auditor.</p>
        {isSignup && <label className="mb-4 block text-sm">Họ tên<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" required /></label>}
        <label className="mb-4 block text-sm">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" required /></label>
        <label className="mb-4 block text-sm">Mật khẩu<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" minLength={8} required /></label>
        {error && <p className="mb-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 font-medium text-slate-950 disabled:opacity-60"><LogIn size={17} />{busy ? 'Đang xử lý…' : isSignup ? 'Tạo tài khoản' : 'Đăng nhập'}</button>
        <button type="button" onClick={() => { setIsSignup(!isSignup); setError(''); }} className="mt-4 w-full text-sm text-slate-400 hover:text-cyan-300">{isSignup ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có mật khẩu? Tạo tài khoản lần đầu'}</button>
      </form>
    </div>
  );
};
