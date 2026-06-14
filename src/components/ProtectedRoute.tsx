import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Loader2 } from 'lucide-react';

export default function ProtectedRoute() {
  const { user, appUser, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Verifying Identity...</p>
      </div>
    );
  }

  if (!user || !appUser || appUser.status !== 'Active') {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
