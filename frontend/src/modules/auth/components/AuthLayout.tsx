// src/components/AuthLayout.tsx
import React from "react";

interface AuthLayoutProps {
  children: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  loading?: boolean;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ 
  children, 
  title, 
  subtitle, 
  loading 
}) => {
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 animate-pulse" />
          <div className="h-4 w-40 bg-primary/10 rounded-md animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-black text-white selection:bg-cyan-500/30">
      {/* Left Panel: Hero & Branding */}
      <div className="hidden md:flex md:w-1/2 relative overflow-hidden bg-gray-900 flex-col justify-center">
        <img 
          src="/stock_bg.png" 
          alt="Market Background" 
          className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-luminosity"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black"></div>
        
        {/* Decorative Blur Backgrounds */}
        <div className="absolute top-20 left-20 w-32 h-32 bg-cyan-600/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-40 right-20 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl"></div>

        <div className="relative z-10 flex flex-col justify-center px-10 lg:px-16 max-w-2xl mx-auto w-full">
          {/* Market Terminal Tagline */}
          <div className="flex items-center gap-2.5 mb-3.5 font-['Plus_Jakarta_Sans',sans-serif]">
            <div className="w-7 h-[2.5px] bg-[#00d2ee] rounded-full"></div>
            <span className="text-xs lg:text-sm font-bold tracking-[0.2em] text-[#00d2ee] uppercase">
              MARKET TERMINAL
            </span>
          </div>

          {/* Main Logo & Title Lockup */}
          <div className="flex items-center gap-4 lg:gap-5 mb-7 font-['Plus_Jakarta_Sans',sans-serif]">
            {/* White Logo Square Box with Large Inner Emblem */}
            <div className="bg-white p-1 rounded-none shadow-lg shrink-0 flex items-center justify-center aspect-square w-16 h-16 lg:w-20 lg:h-20 overflow-hidden">
              <img 
                src="/stockpros-logo.png" 
                alt="StockPros Logo" 
                className="w-full h-full object-contain scale-[1.55]" 
              />
            </div>
            {/* Wordmark */}
            <h1 className="text-5xl lg:text-6xl font-[900] tracking-[-0.03em] leading-none flex items-center select-none">
              <span className="text-white">Stock</span><span className="text-[#00d2ee]">Pros</span>
            </h1>
          </div>

          <p className="text-base lg:text-lg text-[#9CA3AF] leading-relaxed font-normal">
            Professional-grade market intelligence, predictive forecasting, and real-time decision support—all in one unified platform
          </p>
        </div>
      </div>

      {/* Right Panel: Auth Form */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 lg:px-24 bg-[#0a0a0a] relative overflow-hidden font-['Plus_Jakarta_Sans',sans-serif]">
        {/* Floating circles */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-900/20 rounded-full blur-[100px]"></div>
        <div className="absolute top-1/2 -left-24 w-64 h-64 bg-cyan-900/10 rounded-full blur-[100px]"></div>

        <div className="relative z-10 w-full max-w-md mx-auto">
          {/* Logo for mobile screens */}
          <div className="md:hidden mb-8 flex flex-col items-center gap-2.5 text-center">
            <div className="flex items-center gap-2">
              <div className="w-6 h-[2px] bg-[#00d2ee] rounded-full"></div>
              <span className="text-xs font-bold tracking-[0.18em] text-[#00d2ee] uppercase">
                MARKET TERMINAL
              </span>
            </div>
            <div className="flex items-center gap-3.5">
              <div className="bg-white p-1 rounded-none shadow-md shrink-0 flex items-center justify-center aspect-square w-14 h-14 overflow-hidden">
                <img src="/stockpros-logo.png" alt="Logo" className="w-full h-full object-contain scale-[1.55]" />
              </div>
              <h2 className="text-4xl font-[900] tracking-[-0.03em] text-white">Stock<span className="text-[#00d2ee]">Pros</span></h2>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl lg:text-4xl font-bold tracking-tight text-white mb-3 text-left">{title}</h2>
            {subtitle && (
              <p className="text-[#9CA3AF] text-left text-sm lg:text-base leading-relaxed font-normal">
                {subtitle}
              </p>
            )}
          </div>

          {children}
        </div>
      </div>
    </div>
  );
};