import { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, Loader2, Mail, Lock, Eye, EyeOff, UserPlus, LogIn } from 'lucide-react';
import {
  signInWithRedirect, getRedirectResult,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  auth, googleProvider
} from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

type Tab = 'google' | 'email';
type EmailMode = 'signin' | 'signup';

export default function Login() {
  const [tab, setTab] = useState<Tab>('google');
  const [emailMode, setEmailMode] = useState<EmailMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, appUser } = useAuthStore();

  // Handle redirect result when user comes back from Google sign-in
  useEffect(() => {
    setLoading(true);
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          // Auth state change handled by authStore listener
        }
      })
      .catch((err) => {
        if (err.code !== 'auth/no-auth-event') {
          setError('Google sign-in failed. Please try again.');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setError('');
      setLoading(true);
      await signInWithRedirect(auth, googleProvider);
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!email.trim() || !password.trim()) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setError('No account found with this email. Ask your admin to add you, or create an account below.');
      } else if (err.code === 'auth/wrong-password') {
        setError('Incorrect password. Please try again.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.');
      } else {
        setError(err.message || 'Sign-in failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!name.trim()) { setError('Please enter your full name.'); return; }
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }

    setLoading(true);
    try {
      // Check if the email has been pre-approved by admin
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', email.trim().toLowerCase()));
      const snap = await getDocs(q);

      if (!snap.empty && snap.docs[0].data().status === 'Inactive') {
        setError('Your account has been deactivated. Contact an administrator.');
        setLoading(false);
        return;
      }

      // Create the Firebase Auth account — authStore will handle Firestore record creation
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      // authStore's onAuthStateChanged will pick this up automatically
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Please sign in instead.');
        setEmailMode('signin');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak. Use at least 6 characters.');
      } else {
        setError(err.message || 'Failed to create account.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading && !email) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-white mx-auto" />
          <p className="text-white/60 font-bold uppercase tracking-widest text-sm">Verifying Identity...</p>
        </div>
      </div>
    );
  }

  if (user && appUser?.status === 'Pending') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto text-amber-400 border border-amber-500/20">
            <ShieldCheck className="w-10 h-10" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Approval Pending</h1>
            <p className="text-sm text-white/60 mt-3 leading-relaxed">
              Your account <span className="text-amber-400 font-bold">({user.email})</span> has been registered.
              <br />An administrator needs to approve your access before you can log in.
            </p>
          </div>
          <button onClick={() => auth.signOut()} className="w-full h-12 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-2xl font-bold transition-all">
            Sign Out & Try Another Account
          </button>
        </div>
      </div>
    );
  }

  if (user && appUser?.status === 'Inactive') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto text-red-400 border border-red-500/20">
            <AlertTriangle className="w-10 h-10" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Account Inactive</h1>
            <p className="text-sm text-white/60 mt-2">Your account has been deactivated. Please contact an administrator.</p>
          </div>
          <button onClick={() => auth.signOut()} className="w-full h-12 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-2xl font-bold transition-all">
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-600/5 rounded-full blur-3xl" />
      </div>

      <div className="max-w-md w-full relative">
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 space-y-7 shadow-2xl">
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl border border-white/20">
              <ShieldCheck className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tighter">777 Inventory</h1>
              <p className="text-xs text-white/40 font-bold uppercase tracking-widest mt-1">Secure Access Portal</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex bg-white/5 rounded-2xl p-1 gap-1 border border-white/10">
            <button
              onClick={() => { setTab('google'); setError(''); setSuccess(''); }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                tab === 'google' ? 'bg-white text-gray-900 shadow-lg' : 'text-white/50 hover:text-white/80'
              }`}
            >
              Google
            </button>
            <button
              onClick={() => { setTab('email'); setError(''); setSuccess(''); }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                tab === 'email' ? 'bg-white text-gray-900 shadow-lg' : 'text-white/50 hover:text-white/80'
              }`}
            >
              Email & Password
            </button>
          </div>

          {/* Error / Success */}
          {error && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300 font-medium">{error}</p>
            </div>
          )}
          {success && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
              <p className="text-sm text-emerald-300 font-medium text-center">{success}</p>
            </div>
          )}

          {/* Google Tab */}
          {tab === 'google' && (
            <div className="space-y-4">
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full h-14 bg-white hover:bg-gray-50 text-gray-900 rounded-2xl font-black text-sm flex items-center justify-center gap-3 transition-all shadow-xl disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin text-gray-600" /> : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Continue with Google
                  </>
                )}
              </button>
              <p className="text-center text-xs text-white/30">Recommended for fastest access</p>
            </div>
          )}

          {/* Email Tab */}
          {tab === 'email' && (
            <div className="space-y-5">
              {/* Sub-tabs */}
              <div className="flex gap-4 border-b border-white/10 pb-1">
                <button
                  onClick={() => { setEmailMode('signin'); setError(''); }}
                  className={`flex items-center gap-2 pb-2 text-xs font-black uppercase tracking-widest border-b-2 transition-all -mb-px ${
                    emailMode === 'signin' ? 'border-white text-white' : 'border-transparent text-white/40 hover:text-white/60'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" /> Sign In
                </button>
                <button
                  onClick={() => { setEmailMode('signup'); setError(''); }}
                  className={`flex items-center gap-2 pb-2 text-xs font-black uppercase tracking-widest border-b-2 transition-all -mb-px ${
                    emailMode === 'signup' ? 'border-white text-white' : 'border-transparent text-white/40 hover:text-white/60'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" /> Create Account
                </button>
              </div>

              <form onSubmit={emailMode === 'signin' ? handleEmailSignIn : handleEmailSignUp} className="space-y-4">
                {emailMode === 'signup' && (
                  <div className="relative">
                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input
                      type="text"
                      placeholder="Full Name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="w-full h-12 bg-white/5 border border-white/10 text-white placeholder-white/30 rounded-2xl pl-11 pr-4 text-sm font-medium focus:outline-none focus:border-white/30 focus:bg-white/10 transition-all"
                    />
                  </div>
                )}

                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    type="email"
                    placeholder="Email Address"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full h-12 bg-white/5 border border-white/10 text-white placeholder-white/30 rounded-2xl pl-11 pr-4 text-sm font-medium focus:outline-none focus:border-white/30 focus:bg-white/10 transition-all"
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full h-12 bg-white/5 border border-white/10 text-white placeholder-white/30 rounded-2xl pl-11 pr-12 text-sm font-medium focus:outline-none focus:border-white/30 focus:bg-white/10 transition-all"
                  />
                  <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 bg-white hover:bg-gray-100 text-gray-900 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-xl disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : emailMode === 'signin' ? 'Sign In' : 'Create Account'}
                </button>
              </form>

              {emailMode === 'signup' && (
                <p className="text-xs text-white/30 text-center leading-relaxed">
                  New accounts require admin approval before accessing the dashboard.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
