import { create } from 'zustand';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'admin' | 'warehouse_staff' | 'shop_staff';
  location: string;
  status: 'Active' | 'Inactive';
}

interface AuthState {
  user: any;
  appUser: AppUser | null;
  loading: boolean;
  setUser: (user: any, appUser: AppUser | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: { uid: 'open-user-123' },
  appUser: {
    id: 'admin-123',
    name: 'Open Admin',
    email: 'admin@777global.com',
    role: 'super_admin',
    location: 'Global',
    status: 'Active'
  },
  loading: false,
  setUser: (user, appUser) => set({ user, appUser, loading: false }),
  setLoading: (loading) => set({ loading }),
}));

export const initAuth = () => {
  // Authentication is disabled; open for all
};
