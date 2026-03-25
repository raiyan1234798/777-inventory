import { create } from 'zustand';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: 'Super Admin' | 'Admin' | 'Warehouse Staff' | 'Shop Staff';
  location: string;
  status: 'Active' | 'Inactive';
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

// Initialize auth listener
export const initAuth = () => {
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      // Try to fetch custom user data from Firestore
      try {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          useAuthStore.getState().setUser(firebaseUser, { id: userDoc.id, ...userDoc.data() } as AppUser);
        } else {
          // Fallback if no specific role document exists yet
          useAuthStore.getState().setUser(firebaseUser, {
            id: firebaseUser.uid,
            name: firebaseUser.displayName || firebaseUser.email || 'User',
            email: firebaseUser.email || '',
            role: 'Shop Staff', // Default role
            location: 'Unknown',
            status: 'Active'
          });
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        useAuthStore.getState().setUser(firebaseUser, null);
      }
    } else {
      useAuthStore.getState().setUser(null, null);
    }
  });
};
