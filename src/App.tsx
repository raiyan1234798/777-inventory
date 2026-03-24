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

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
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
