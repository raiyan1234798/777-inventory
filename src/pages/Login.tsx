import { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, Mail, Lock, Eye, EyeOff, ArrowRight, ChevronLeft, ShieldCheck, User, RefreshCw } from 'lucide-react';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  auth,
  googleProvider,
} from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────
type View = 'main' | 'email_signin' | 'email_signup' | 'reset_password';

// ─── Component ────────────────────────────────────────────────────────────────
export default function Login() {
  const { user, appUser, loading } = useAuthStore();

  const [view, setView]                 = useState<View>('main');
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [name, setName]                 = useState('');
  const [showPass, setShowPass]         = useState(false);
  const [error, setError]               = useState('');
  const [infoMsg, setInfoMsg]           = useState('');
  const [busy, setBusy]                 = useState(false);
  const [failCount, setFailCount]       = useState(0);
  const [lockUntil, setLockUntil]       = useState<number | null>(null);
  const [lockRemaining, setLockRemaining] = useState(0);
  const lockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear messages when switching views
  useEffect(() => { setError(''); setInfoMsg(''); }, [view]);

  // Countdown timer for lockout
  useEffect(() => {
    if (!lockUntil) return;
    const tick = () => {
      const rem = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setLockRemaining(rem);
      if (rem === 0) {
        setLockUntil(null);
        setFailCount(0);
        setError('');
        if (lockTimerRef.current) clearInterval(lockTimerRef.current);
      }
    };
    tick();
    lockTimerRef.current = setInterval(tick, 1000);
    return () => { if (lockTimerRef.current) clearInterval(lockTimerRef.current); };
  }, [lockUntil]);

  // ─── Auth redirects ──────────────────────────────────────────────────────
  if (loading) return <SplashLoader />;
  if (user && appUser?.status === 'Active') return <Navigate to="/dashboard" replace />;

  // ─── Pending screen ──────────────────────────────────────────────────────
  if (user && appUser?.status === 'Pending') {
    return (
      <Screen>
        <Card>
          <div className="flex flex-col items-center text-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-amber-400" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white mb-2">Awaiting Approval</h2>
              <p className="text-sm text-white/50 leading-relaxed max-w-xs">
                Your account <span className="text-amber-400 font-bold">{user.email}</span> has been registered. An administrator must activate your access before you can proceed.
              </p>
            </div>
            <button
              onClick={() => auth.signOut()}
              className="w-full h-11 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-sm font-bold transition-all"
            >
              Sign out &amp; use another account
            </button>
          </div>
        </Card>
      </Screen>
    );
  }

  // ─── Inactive screen ─────────────────────────────────────────────────────
  if (user && appUser?.status === 'Inactive') {
    return (
      <Screen>
        <Card>
          <div className="flex flex-col items-center text-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <span className="text-3xl">🚫</span>
            </div>
            <div>
              <h2 className="text-xl font-black text-white mb-2">Account Deactivated</h2>
              <p className="text-sm text-white/50">Your account has been deactivated. Please contact your administrator.</p>
            </div>
            <button
              onClick={() => auth.signOut()}
              className="w-full h-11 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-sm font-bold transition-all"
            >
              Sign Out
            </button>
          </div>
        </Card>
      </Screen>
    );
  }

  // ─── Handlers ────────────────────────────────────────────────────────────

  const isLocked = lockUntil !== null && Date.now() < lockUntil;

  const handleFailedAttempt = () => {
    const next = failCount + 1;
    setFailCount(next);
    // After 5 failures → 60-second lockout
    if (next >= 5) {
      const until = Date.now() + 60_000;
      setLockUntil(until);
      setError(`Too many failed attempts. Try again in 60 seconds.`);
    }
  };

  const handleGoogleSignIn = async () => {
    if (isLocked || busy) return;
    setBusy(true);
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
      // authStore onAuthStateChanged handles the rest
    } catch (err: any) {
      const code = err?.code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setBusy(false);
        return; // user closed popup — not an error
      }
      if (code === 'auth/popup-blocked') {
        setError('Your browser blocked the sign-in popup. Please allow popups for this site and try again.');
      } else if (code === 'auth/unauthorized-domain') {
        setError('This domain is not authorised for sign-in. Contact an administrator.');
      } else {
        setError(err.message ?? 'Google sign-in failed. Please try again.');
      }
      setBusy(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || busy) return;
    if (!email.trim() || !password) { setError('Please enter your email and password.'); return; }
    setBusy(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      // success — authStore takes over
    } catch (err: any) {
      const code = err?.code ?? '';
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        handleFailedAttempt();
        if (!isLocked) setError('Incorrect email or password. If you were added by an admin, use "Create Account" to set up your password first.');
      } else if (code === 'auth/too-many-requests') {
        setError('Access temporarily blocked due to too many attempts. Please wait and try again.');
      } else if (code === 'auth/user-disabled') {
        setError('This account has been disabled. Contact your administrator.');
      } else {
        setError(err.message ?? 'Sign-in failed. Please try again.');
      }
      setBusy(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || busy) return;
    if (!name.trim())   { setError('Please enter your full name.'); return; }
    if (!email.trim())  { setError('Please enter your email address.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }

    setBusy(true);
    setError('');
    try {
      // Check if the email is already pre-registered (added by admin)
      const q = query(collection(db, 'users'), where('email', '==', email.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data();
        if (data.status === 'Inactive') {
          setError('This account has been deactivated. Contact your administrator.');
          setBusy(false);
          return;
        }
      }
      // Create Firebase Auth account; authStore will link with the Firestore record
      await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    } catch (err: any) {
      const code = err?.code ?? '';
      if (code === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Please sign in instead.');
        setView('email_signin');
      } else if (code === 'auth/weak-password') {
        setError('Password is too weak. Use at least 6 characters with a mix of letters and numbers.');
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError(err.message ?? 'Could not create account. Please try again.');
      }
      setBusy(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    setBusy(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      setInfoMsg('Password reset email sent! Check your inbox (and spam folder).');
    } catch (err: any) {
      const code = err?.code ?? '';
      if (code === 'auth/user-not-found') {
        setError('No account found for this email. Please create an account first.');
      } else {
        setError(err.message ?? 'Failed to send reset email.');
      }
    } finally {
      setBusy(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <Screen>
      <Card>
        {/* ── Brand ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 via-blue-600 to-violet-700 flex items-center justify-center shadow-2xl shadow-indigo-500/40">
              <span className="text-white font-black text-xl tracking-tighter select-none">777</span>
            </div>
            {/* Glow ring */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-700 blur-xl opacity-30 -z-10" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black text-white tracking-tight">777 Inventory</h1>
            <p className="text-[11px] text-white/30 font-semibold tracking-[0.18em] uppercase mt-0.5">
              Secure Operations Portal
            </p>
          </div>
        </div>

        {/* ── Security badge ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-1.5 mb-6">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] font-bold text-emerald-400/80 tracking-wide">
            JWT · TLS 1.3 · Firebase Auth
          </span>
        </div>

        {/* ── Lockout banner ────────────────────────────────────────────── */}
        {isLocked && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
            <Lock className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-xs text-red-300 font-medium">
              Too many attempts. Retry in <span className="font-black">{lockRemaining}s</span>.
            </p>
          </div>
        )}

        {/* ── Error / Info alerts ───────────────────────────────────────── */}
        {error && !isLocked && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 animate-in slide-in-from-top-2 duration-200">
            <span className="text-red-400 text-sm flex-shrink-0 mt-px">✕</span>
            <p className="text-xs text-red-300 font-medium leading-relaxed">{error}</p>
          </div>
        )}
        {infoMsg && (
          <div className="mb-5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3 animate-in slide-in-from-top-2 duration-200">
            <span className="text-emerald-400 text-sm flex-shrink-0 mt-px">✓</span>
            <p className="text-xs text-emerald-300 font-medium leading-relaxed">{infoMsg}</p>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* MAIN VIEW                                                        */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {view === 'main' && (
          <div className="space-y-3">
            {/* Google */}
            <button
              onClick={handleGoogleSignIn}
              disabled={busy || isLocked}
              className="w-full h-12 rounded-xl bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-900 font-bold text-sm flex items-center justify-center gap-3 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? (
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              ) : (
                <>
                  <GoogleIcon />
                  Continue with Google
                </>
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-white/[0.06]" />
              <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">or</span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>

            {/* Email sign-in */}
            <button
              onClick={() => setView('email_signin')}
              className="w-full h-12 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-white/70 hover:text-white font-bold text-sm flex items-center justify-center gap-2.5 transition-all"
            >
              <Mail className="w-4 h-4 text-white/40" />
              Sign in with Email
            </button>

            {/* Create account */}
            <button
              onClick={() => setView('email_signup')}
              className="w-full h-12 rounded-xl bg-transparent hover:bg-white/[0.04] border border-white/[0.06] text-white/40 hover:text-white/70 font-bold text-sm flex items-center justify-center gap-2.5 transition-all"
            >
              Create account with Email
            </button>

            <p className="text-center text-[10px] text-white/20 pt-1 leading-relaxed">
              If an admin added your email, use <span className="text-white/35">Create account</span> to set your password.
            </p>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* EMAIL SIGN-IN VIEW                                               */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {view === 'email_signin' && (
          <form onSubmit={handleEmailSignIn} className="space-y-4">
            <SectionHeader
              title="Sign in with Email"
              onBack={() => setView('main')}
            />

            <div className="space-y-3">
              <AuthInput
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={setEmail}
                icon={<Mail className="w-4 h-4" />}
                autoFocus
                disabled={busy || isLocked}
              />
              <PasswordInput
                value={password}
                onChange={setPassword}
                show={showPass}
                onToggle={() => setShowPass(s => !s)}
                disabled={busy || isLocked}
              />
            </div>

            <SubmitButton busy={busy} disabled={isLocked} label="Sign In" />

            <div className="flex items-center justify-between pt-0.5">
              <button
                type="button"
                onClick={() => setView('reset_password')}
                className="text-xs text-white/30 hover:text-white/60 font-semibold transition-colors"
              >
                Forgot password?
              </button>
              <button
                type="button"
                onClick={() => setView('email_signup')}
                className="text-xs text-white/30 hover:text-white/60 font-semibold transition-colors"
              >
                Create account →
              </button>
            </div>
          </form>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* EMAIL SIGN-UP VIEW                                               */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {view === 'email_signup' && (
          <form onSubmit={handleEmailSignUp} className="space-y-4">
            <SectionHeader
              title="Create Your Account"
              subtitle="Pre-approved emails get instant access."
              onBack={() => setView('main')}
            />

            <div className="space-y-3">
              <AuthInput
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={setName}
                icon={<User className="w-4 h-4" />}
                autoFocus
                disabled={busy}
              />
              <AuthInput
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={setEmail}
                icon={<Mail className="w-4 h-4" />}
                disabled={busy}
              />
              <PasswordInput
                value={password}
                onChange={setPassword}
                show={showPass}
                onToggle={() => setShowPass(s => !s)}
                placeholder="Password (min 6 chars)"
                disabled={busy}
              />
            </div>

            <SubmitButton busy={busy} label="Create Account" />

            <p className="text-center text-xs text-white/30">
              Already have an account?{' '}
              <button type="button" onClick={() => setView('email_signin')} className="text-indigo-400 hover:text-indigo-300 font-bold transition-colors">
                Sign in
              </button>
            </p>
          </form>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* PASSWORD RESET VIEW                                              */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {view === 'reset_password' && (
          <form onSubmit={handlePasswordReset} className="space-y-4">
            <SectionHeader
              title="Reset Password"
              subtitle="We'll send a reset link to your inbox."
              onBack={() => setView('email_signin')}
            />

            <AuthInput
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={setEmail}
              icon={<Mail className="w-4 h-4" />}
              autoFocus
              disabled={busy}
            />

            <SubmitButton busy={busy} label="Send Reset Link" icon={<RefreshCw className="w-4 h-4" />} />
          </form>
        )}
      </Card>
    </Screen>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SplashLoader() {
  return (
    <div className="min-h-screen bg-[#030308] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>
        <p className="text-[10px] font-black text-white/20 tracking-[0.25em] uppercase">
          Authenticating…
        </p>
      </div>
    </div>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#030308] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient gradient blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-indigo-600/[0.12] blur-[130px]" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-violet-700/[0.10] blur-[130px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-blue-600/[0.06] blur-[100px]" />
      </div>
      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.5) 1px,transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-full max-w-sm">
      {/* Outer glow */}
      <div className="absolute -inset-px rounded-[26px] bg-gradient-to-br from-indigo-500/20 via-transparent to-violet-500/20 blur-sm" />
      <div className="relative bg-white/[0.03] backdrop-blur-3xl border border-white/[0.07] rounded-3xl p-8 shadow-2xl shadow-black/60">
        {children}
      </div>
    </div>
  );
}

function SectionHeader({
  title, subtitle, onBack,
}: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <div className="flex items-start justify-between mb-2">
      <div>
        <h2 className="text-base font-black text-white">{title}</h2>
        {subtitle && <p className="text-xs text-white/30 mt-0.5">{subtitle}</p>}
      </div>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-white/30 hover:text-white/60 font-semibold transition-colors mt-0.5 flex-shrink-0"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Back
      </button>
    </div>
  );
}

function AuthInput({
  type, placeholder, value, onChange, icon, autoFocus, disabled,
}: {
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  icon?: React.ReactNode;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      {icon && (
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
          {icon}
        </div>
      )}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoFocus={autoFocus}
        disabled={disabled}
        autoComplete={type === 'email' ? 'email' : type === 'password' ? 'current-password' : 'name'}
        className="w-full h-12 bg-white/[0.05] border border-white/[0.08] hover:border-white/[0.14] focus:border-indigo-500/50 focus:bg-white/[0.07] text-white placeholder-white/20 rounded-xl pl-10 pr-4 text-sm font-medium outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      />
    </div>
  );
}

function PasswordInput({
  value, onChange, show, onToggle, placeholder = 'Password', disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
        <Lock className="w-4 h-4" />
      </div>
      <input
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        autoComplete="current-password"
        className="w-full h-12 bg-white/[0.05] border border-white/[0.08] hover:border-white/[0.14] focus:border-indigo-500/50 focus:bg-white/[0.07] text-white placeholder-white/20 rounded-xl pl-10 pr-12 text-sm font-medium outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function SubmitButton({
  busy, disabled, label, icon,
}: {
  busy: boolean;
  disabled?: boolean;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="w-full h-12 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98] text-white font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {busy ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <>
          <span>{label}</span>
          {icon ?? <ArrowRight className="w-4 h-4" />}
        </>
      )}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-[18px] h-[18px] flex-shrink-0" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
