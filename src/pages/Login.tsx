import { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { signInWithRedirect, getRedirectResult, auth, googleProvider } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';

export default function Login() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, appUser } = useAuthStore();

  // Handle redirect result when user comes back from Google sign-in
  useEffect(() => {
    setLoading(true);
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          // Successfully signed in via redirect - authStore will handle the rest
        }
      })
      .catch((err) => {
        console.error(err);
        if (err.code !== 'auth/no-auth-event') {
          setError(err.message || 'Sign-in failed. Please try again.');
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
      console.error(err);
      setError(err.message || 'Failed to sign in with Google');
      setLoading(false);
    }
  };

  if (loading) {
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
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto text-amber-400">
            <ShieldCheck className="w-10 h-10" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Approval Pending</h1>
            <p className="text-sm text-white/60 mt-2">
              Your account <span className="text-white font-bold">({user.email})</span> has been registered.
              An administrator needs to approve your access before you can log in.
            </p>
          </div>
          <button
            onClick={() => auth.signOut()}
            className="w-full h-12 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-2xl font-bold transition-all"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (user && appUser?.status === 'Inactive') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto text-red-400">
            <AlertTriangle className="w-10 h-10" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Account Inactive</h1>
            <p className="text-sm text-white/60 mt-2">
              Your account has been deactivated. Please contact an administrator.
            </p>
          </div>
          <button
            onClick={() => auth.signOut()}
            className="w-full h-12 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-2xl font-bold transition-all"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
      </div>

      <div className="max-w-md w-full relative">
        {/* Card */}
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 space-y-8 shadow-2xl">
          {/* Header */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white/10 rounded-2xl border border-white/20 mb-2">
              <ShieldCheck className="w-10 h-10 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-white tracking-tighter">777 Inventory</h1>
              <p className="text-xs text-white/40 font-bold uppercase tracking-widest mt-1">Secure Access Portal</p>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300 font-medium">{error}</p>
            </div>
          )}

          {/* Google Sign In */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full h-14 bg-white hover:bg-gray-50 text-gray-900 rounded-2xl font-black text-sm flex items-center justify-center gap-3 transition-all shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign in with Google
              </>
            )}
          </button>

          <p className="text-center text-xs text-white/30 font-medium">
            Only authorized accounts can access this system.<br />
            New users require admin approval.
          </p>
        </div>
      </div>
    </div>
  );
}
