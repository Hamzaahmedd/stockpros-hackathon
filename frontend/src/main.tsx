// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/app/App";
import { AuthProvider } from "@/modules/auth";
import { ThemeProvider } from "@/shared/hooks/useTheme";
import { POSTHOG_KEY, POSTHOG_HOST } from "@/shared/config";
import { BrowserRouter } from "react-router-dom";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import "./index.css";
import { ToastContainer } from "react-toastify";

if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    autocapture: true,
    capture_pageview: false,
    session_recording: {
      maskAllInputs: true,
    },
  });
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

const root = ReactDOM.createRoot(rootElement);

const routedApp = (
  <BrowserRouter>
    <App />
    <ToastContainer position="top-right" />
  </BrowserRouter>
);

root.render(
  <React.StrictMode>
    <AuthProvider>
      <ThemeProvider>
        {POSTHOG_KEY ? (
          <PostHogProvider client={posthog}>{routedApp}</PostHogProvider>
        ) : (
          routedApp
        )}
      </ThemeProvider>
    </AuthProvider>
  </React.StrictMode>
);
