import { create } from 'zustand';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, getRedirectResult, type User as FirebaseUser } from 'firebase/auth';
import {
  collection, query, where, getDocs,
  setDoc, doc, onSnapshot, updateDoc
} from 'firebase/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'admin' | 'warehouse_staff' | 'shop_staff';
  location_id: string;
  status: 'Active' | 'Inactive' | 'Pending';
  permissions?: string[];
}

interface AuthState {
  user: FirebaseUser | null;
  appUser: AppUser | null;
  /** Firebase JWT ID token — refreshed every 50 min. Null when not logged in. */
  token: string | null;
  loading: boolean;
  setUser: (user: FirebaseUser | null, appUser: AppUser | null) => void;
  setLoading: (loading: boolean) => void;
  setToken: (token: string | null) => void;
  /** Force-refresh the JWT ID token and store the new value. */
  refreshToken: () => Promise<string | null>;
}

// ─── Super Admin Registry ─────────────────────────────────────────────────────
// These emails always have super_admin role + Active status, regardless of
// what is stored in Firestore.
const SUPER_ADMINS: Record<string, 'super_admin'> = {
  'tripleseven918@gmail.com': 'super_admin',
  'abubackerraiyan@gmail.com': 'super_admin',
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  appUser: null,
  token: null,
  loading: true,
  setUser: (user, appUser) => set({ user, appUser, loading: false }),
  setLoading: (loading) => set({ loading }),
  setToken: (token) => set({ token }),
  refreshToken: async () => {
    const { user } = get();
    if (!user) return null;
    try {
      const newToken = await user.getIdToken(/* forceRefresh */ true);
      set({ token: newToken });
      return newToken;
    } catch (err) {
      console.error('[AuthStore] Token refresh failed:', err);
      return null;
    }
  },
}));

// ─── initAuth ─────────────────────────────────────────────────────────────────
// Call once at app startup (App.tsx useEffect). Sets up:
//   • onAuthStateChanged listener
//   • Firestore real-time user record listener (for instant deactivation)
//   • Automatic JWT refresh every 50 minutes

export const initAuth = () => {
  let unsubscribeSnapshot: (() => void) | null = null;
  let tokenRefreshTimer: ReturnType<typeof setInterval> | null = null;

  const cleanup = () => {
    if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
    if (tokenRefreshTimer)    { clearInterval(tokenRefreshTimer); tokenRefreshTimer = null; }
  };

  // Resolve any pending redirect results (fixes stuck "VERIFYING IDENTITY" loader)
  getRedirectResult(auth).catch((err) => {
    console.warn('[AuthStore] Redirect result error:', err);
  });

  onAuthStateChanged(auth, async (firebaseUser) => {
    // Clean up previous listeners / timers on every auth state change
    cleanup();

    if (!firebaseUser) {
      useAuthStore.getState().setUser(null, null);
      useAuthStore.getState().setToken(null);
      return;
    }

    useAuthStore.getState().setLoading(true);

    try {
      // ── 1. Fetch JWT ID token ────────────────────────────────────────────
      const idToken = await firebaseUser.getIdToken();
      useAuthStore.getState().setToken(idToken);

      // ── 2. Auto-refresh every 50 min (tokens expire after 60 min) ───────
      tokenRefreshTimer = setInterval(async () => {
        try {
          const refreshed = await firebaseUser.getIdToken(true);
          useAuthStore.getState().setToken(refreshed);
        } catch (e) {
          console.warn('[AuthStore] Scheduled token refresh failed:', e);
        }
      }, 50 * 60 * 1000);

      // ── 3. Resolve app user from Firestore ───────────────────────────────
      const userEmail = (firebaseUser.email ?? '').toLowerCase().trim();
      const superAdminRole = SUPER_ADMINS[userEmail];

      const q = query(collection(db, 'users'), where('email', '==', userEmail));
      const snap = await getDocs(q);

      let appUser: AppUser;

      if (!snap.empty) {
        // Existing Firestore record
        const data = snap.docs[0].data() as AppUser;
        appUser = { id: snap.docs[0].id, ...data };

        // Super admins always have the correct role + Active status
        if (superAdminRole) {
          const needsUpdate =
            appUser.role !== superAdminRole || appUser.status !== 'Active';
          if (needsUpdate) {
            appUser.role    = superAdminRole;
            appUser.status  = 'Active';
            await setDoc(
              doc(db, 'users', appUser.id),
              { role: superAdminRole, status: 'Active' },
              { merge: true }
            );
          }
        }

        // If a pre-existing Pending user now has a verified Google/email account,
        // update their display name in Firestore if it was missing.
        if (!appUser.name && firebaseUser.displayName) {
          appUser.name = firebaseUser.displayName;
          await updateDoc(doc(db, 'users', appUser.id), { name: firebaseUser.displayName });
        }
      } else {
        // Brand-new Firebase user — create their Firestore record
        const newRef = doc(collection(db, 'users'));
        appUser = {
          id:           newRef.id,
          name:         firebaseUser.displayName
                          || userEmail.split('@')[0]
                          || 'Unknown',
          email:        userEmail,
          role:         superAdminRole ?? 'shop_staff',
          location_id:  '',
          status:       superAdminRole ? 'Active' : 'Pending',
        };
        await setDoc(newRef, appUser);
      }

      useAuthStore.getState().setUser(firebaseUser, appUser);

      // ── 4. Real-time listener — instantly kicks deactivated users ────────
      unsubscribeSnapshot = onSnapshot(
        doc(db, 'users', appUser.id),
        (docSnap) => {
          if (!docSnap.exists()) {
            // User record deleted — force sign out
            auth.signOut();
            return;
          }
          const latest = docSnap.data() as AppUser;
          if (latest.status === 'Inactive') {
            auth.signOut();
          } else {
            useAuthStore.getState().setUser(firebaseUser, latest);
          }
        },
        (err) => console.error('[AuthStore] Snapshot error:', err)
      );

    } catch (err) {
      console.error('[AuthStore] initAuth error:', err);
      // On any resolution failure, still surface the Firebase user so the UI
      // can show an appropriate error state rather than a blank screen.
      useAuthStore.getState().setUser(firebaseUser, null);
    }
  });
};
