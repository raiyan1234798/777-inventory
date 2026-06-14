import { create } from 'zustand';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { collection, query, where, getDocs, setDoc, doc } from 'firebase/firestore';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'admin' | 'warehouse_staff' | 'shop_staff';
  location_id: string;
  status: 'Active' | 'Inactive' | 'Pending';
}

interface AuthState {
  user: FirebaseUser | null;
  appUser: AppUser | null;
  loading: boolean;
  setUser: (user: FirebaseUser | null, appUser: AppUser | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  appUser: null,
  loading: true,
  setUser: (user, appUser) => set({ user, appUser, loading: false }),
  setLoading: (loading) => set({ loading }),
}));

export const initAuth = () => {
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      useAuthStore.getState().setUser(null, null);
      return;
    }

    useAuthStore.getState().setLoading(true);

    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', firebaseUser.email));
      const querySnapshot = await getDocs(q);

      let appUser: AppUser | null = null;

      if (!querySnapshot.empty) {
        // User exists in Firestore
        appUser = querySnapshot.docs[0].data() as AppUser;
        
        // Auto-approve tripleseven918@gmail.com if they aren't super_admin or Active
        if (firebaseUser.email === 'tripleseven918@gmail.com') {
          let needsUpdate = false;
          if (appUser.role !== 'super_admin') { appUser.role = 'super_admin'; needsUpdate = true; }
          if (appUser.status !== 'Active') { appUser.status = 'Active'; needsUpdate = true; }
          
          if (needsUpdate) {
            await setDoc(doc(db, 'users', appUser.id), { role: 'super_admin', status: 'Active' }, { merge: true });
          }
        }
      } else {
        // User does not exist, create a Pending user or auto-approve if tripleseven918@gmail.com
        const newDocRef = doc(collection(db, 'users'));
        const isSuperAdmin = firebaseUser.email === 'tripleseven918@gmail.com';
        
        appUser = {
          id: newDocRef.id,
          name: firebaseUser.displayName || firebaseUser.email || 'Unknown User',
          email: firebaseUser.email || '',
          role: isSuperAdmin ? 'super_admin' : 'shop_staff',
          location_id: '',
          status: isSuperAdmin ? 'Active' : 'Pending',
        };
        
        await setDoc(newDocRef, appUser);
      }

      useAuthStore.getState().setUser(firebaseUser, appUser);
    } catch (error) {
      console.error("Error fetching user data:", error);
      useAuthStore.getState().setUser(firebaseUser, null); // Will show pending/error
    }
  });
};
