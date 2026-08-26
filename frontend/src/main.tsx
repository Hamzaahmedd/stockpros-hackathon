// src/main.tsx - DEBUG VERSION
import "@/shared/utils/timezone"; // Enforce Pakistan Standard Time (PKT) for all displayed dates
import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/app/App";
import { AuthProvider } from "@/modules/auth";
import { ThemeProvider } from "@/shared/hooks/useTheme";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import { ToastContainer } from "react-toastify";

  const rootElement = document.getElementById("root");
  console.log("Root element:", rootElement);
  
  if (!rootElement) {
    throw new Error("Root element not found");
  }
  
  const root = ReactDOM.createRoot(rootElement);
  
  root.render(
    <React.StrictMode>
      <AuthProvider>
        <ThemeProvider>
          <BrowserRouter>
            <App />
            <ToastContainer position="top-right" />
          </BrowserRouter>
        </ThemeProvider>
      </AuthProvider>
    </React.StrictMode>
  );
