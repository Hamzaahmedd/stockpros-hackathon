// src/App.tsx
import { Roles, SystemOverview, Users } from "@/modules/access-control";
import {
  Login,
  Onboarding,
  ProtectedRoute,
  VerifyMagicLink,
} from "@/modules/auth";
import { Dashboard } from "@/modules/dashboard";
import { MarketAnalysis, PortfolioHealth } from "@/modules/decision-support";
import { Forecast } from "@/modules/forecast";
import { Markets } from "@/modules/markets";
import { News } from "@/modules/news";
import { Settings } from "@/modules/settings";
import { Watchlist } from "@/modules/watchlist";
import { Navigate, Route, Routes } from "react-router-dom";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';


export default function App() {
  return (
    <>
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
      <Routes>
        {/* Default route redirects to login */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route path="/login" element={<Login />} />
        <Route path="/auth/verify" element={<VerifyMagicLink />} />
        <Route path="/auth/onboarding" element={<Onboarding />} />

        {/* Protected routes */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/market" element={
          <ProtectedRoute>
            <Markets />
          </ProtectedRoute>
        } />
        <Route path="/forecast" element={
          <ProtectedRoute>
            <Forecast />
          </ProtectedRoute>
        } />
        <Route path="/news" element={
          <ProtectedRoute>
            <News />
          </ProtectedRoute>
        } />
        <Route path="/watchlist" element={
          <ProtectedRoute>
            <Watchlist />
          </ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        } />

        <Route
          path="/decision-support/market-analysis"
          element={<MarketAnalysis />}
        />
        <Route
          path="/decision-support/portfolio-health"
          element={
            <ProtectedRoute>
              <PortfolioHealth />
            </ProtectedRoute>
          }
        />

        {/* Access Control Routes */}
        <Route path="/access-control/users" element={
          <ProtectedRoute>
            <Users />
          </ProtectedRoute>
        } />
        <Route path="/access-control/roles" element={
          <ProtectedRoute>
            <Roles />
          </ProtectedRoute>
        } />
        <Route path="/access-control/overview" element={
          <ProtectedRoute>
            <SystemOverview />
          </ProtectedRoute>
        } />


        {/* Catch-all route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
