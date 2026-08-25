// src/components/TopNav.tsx
import { LogoutModal, useAuth } from "@/modules/auth";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "./ui/button";

export const TopNav: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const handleLogout = async () => {
    setIsLogoutModalOpen(false);
    await logout();
    navigate("/login");
  };
  return (
    <nav className="bg-brand-800 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3.5 font-['Plus_Jakarta_Sans',sans-serif]">
          <div className="bg-white p-1 rounded-none shadow-md shrink-0 flex items-center justify-center aspect-square w-12 h-12 overflow-hidden">
            <img src="/stockpros-logo.png" alt="StockPros Logo" className="w-full h-full object-contain scale-[1.55]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 -mb-0.5">
              <span className="w-3.5 h-[2px] bg-[#00d2ee] inline-block rounded-full"></span>
              <span className="text-[9px] font-extrabold tracking-[0.18em] text-[#00d2ee] uppercase">
                MARKET TERMINAL
              </span>
            </div>
            <div className="text-2xl font-[900] tracking-[-0.02em] text-white leading-tight">
              Stock<span className="text-[#00d2ee]">Pros</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <>
                <div className="text-sm">
                  {user.displayName || user.email}
                </div>
                <Button 
                  onClick={() => setIsLogoutModalOpen(true)} 
                  variant="secondary"
                  size="sm"
                >
                  Logout
                </Button>
              </>
            ) : (
              <div className="flex gap-2">
                <a href="/login" className="text-sm hover:underline">Sign in</a>
              </div>
            )}
          </div>
        </div>
        
        <LogoutModal
          isOpen={isLogoutModalOpen}
          onConfirm={handleLogout}
          onCancel={() => setIsLogoutModalOpen(false)}
        />
      </nav>
    );
  };
