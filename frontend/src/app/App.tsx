// src/App.tsx
import { Roles, SystemOverview, Users } from "@/modules/access-control";
import {
  Login,
  Onboarding,
  ProtectedRoute,
  VerifyMagicLink,
} from "@/modules/auth";
import { Dashboard } from "@/modules/dashboard";
import { MarketAnalysis, OpportunityRadar, PortfolioHealth } from "@/modules/decision-support";
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
          <ProtectedRoute resource="CORE_APP">
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/market" element={
          <ProtectedRoute resource="CORE_APP">
            <Markets />
          </ProtectedRoute>
        } />
        <Route path="/forecast" element={
          <ProtectedRoute resource="CORE_APP">
            <Forecast />
          </ProtectedRoute>
        } />
        <Route path="/news" element={
          <ProtectedRoute resource="CORE_APP">
            <News />
          </ProtectedRoute>
        } />
        <Route path="/watchlist" element={
          <ProtectedRoute resource="CORE_APP">
            <Watchlist />
          </ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute resource="CORE_APP">
            <Settings />
          </ProtectedRoute>
        } />

        <Route
          path="/decision-support/radar"
          element={
            <ProtectedRoute resource="CORE_APP">
              <OpportunityRadar />
            </ProtectedRoute>
          }
        />
        <Route
          path="/decision-support/market-analysis"
          element={<ProtectedRoute resource="CORE_APP"><MarketAnalysis /></ProtectedRoute>}
        />
        <Route
          path="/decision-support/portfolio-health"
          element={
            <ProtectedRoute resource="PORTFOLIO">
              <PortfolioHealth />
            </ProtectedRoute>
          }
        />

        {/* Access Control Routes */}
        <Route path="/access-control/users" element={
          <ProtectedRoute requirements={[{ resource: "ACCESS_CONTROL" }, { resource: "ROLE" }] }>
            <Users />
          </ProtectedRoute>
        } />
        <Route path="/access-control/roles" element={
          <ProtectedRoute requirements={[{ resource: "ACCESS_CONTROL" }, { resource: "ROLE" }] }>
            <Roles />
          </ProtectedRoute>
        } />
        <Route path="/access-control/overview" element={
          <ProtectedRoute requirements={[{ resource: "ACCESS_CONTROL" }, { resource: "ROLE" }] }>
            <SystemOverview />
          </ProtectedRoute>
        } />


        {/* Catch-all route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
