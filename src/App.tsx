import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Warehouse from './pages/Warehouse';
import Shops from './pages/Shops';
import Transfers from './pages/Transfers';
import Returns from './pages/Returns';
import Finance from './pages/Finance';
import Users from './pages/Users';
import Billing from './pages/Billing';
import Login from './pages/Login';
import { initAuth, useAuthStore } from './store/authStore';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

function App() {
  useEffect(() => {
    initAuth();
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="warehouse" element={<Warehouse />} />
          <Route path="shops" element={<Shops />} />
          <Route path="billing" element={<Billing />} />
          <Route path="transfers" element={<Transfers />} />
          <Route path="returns" element={<Returns />} />
          <Route path="finance" element={<Finance />} />
          <Route path="users" element={<Users />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
