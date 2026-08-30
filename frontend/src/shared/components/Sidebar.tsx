import { LogoutModal, useAuth } from "@/modules/auth";
import { UnifiedNotifications } from "@/modules/notifications";
import { useTheme } from "@/shared/hooks/useTheme";
import { preloader } from "@/shared/utils/preloader";
import React, { useEffect, useState } from "react";
import {
    FiActivity,
    FiBarChart2,
    FiBriefcase,
    FiChevronDown,
    FiChevronLeft,
    FiChevronRight,
    FiFileText,
    FiHome,
    FiLogOut,
    FiRadio,
    FiSettings,
    FiShield,
    FiTarget,
    FiTrendingUp,
    FiUsers
} from "react-icons/fi";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";

/* ---------------- Navigation Item ---------------- */

function NavItem({
  to,
  icon,
  label,
  active = false,
  collapsed = false,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  collapsed?: boolean;
}) {
  return (
    <Link
      to={to}
      onMouseEnter={() => preloader.preloadRoute(to)}
      onMouseLeave={() => preloader.cancelPreloadRoute(to)}
      onFocus={() => preloader.preloadRoute(to)}
      className={`flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 ${
        active
          ? "bg-secondary text-secondary-foreground font-medium"
          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
      } ${collapsed ? "justify-center px-0" : "w-full"}`}
      title={collapsed ? label : ""}
    >
      <span className="text-lg">{icon}</span>
      {!collapsed && <span className="text-sm font-medium">{label}</span>}
    </Link>
  );
}

/* ---------------- Sidebar ---------------- */

export const Sidebar: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDecisionOpen, setIsDecisionOpen] = useState(false);
  const [isAccessControlOpen, setIsAccessControlOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const { user, can, logout } = useAuth();
  const { theme } = useTheme();

  // The backend might return user roles nested deeply depending on the Prisma include
  const userRoleList =
    user?.userRoles?.map((ur: any) => (ur?.role?.name || ur?.name || "").toUpperCase())
    || user?.roles?.map((r: any) => (typeof r === "string" ? r : r?.name || "").toUpperCase())
    || [];

  const userEmail = user?.email?.trim().toLowerCase() || "";
  const isAdmin = userRoleList.includes("ADMIN");

  const isPortfolioManager =
    userRoleList.includes("PORTFOLIO_MANAGER") ||
    userRoleList.includes("PORTFOLIO MANAGER") ||
    userRoleList.includes("PORTFOLIO");

  const isAnalyst =
    userRoleList.includes("ANALYST") ||
    userRoleList.includes("ANALYST_ROLE") ||
    userRoleList.includes("ANALYST ROLE");

  // If user is NOT an admin, they see standard menus. 
  // If they ARE an admin, they only see standard menus if they also have a Portfolio Manager or Analyst role.
  const showStandardMenus = !isAdmin || isPortfolioManager || isAnalyst;

  // --- NEW PERMISSION GUARD LOGIC ---
  const canSeeAccessControl = isAdmin || (can('ROLE', 'canRead') && !isAnalyst);
  const canSeeUsers = isAdmin || can('USER', 'canRead');
  const canSeeMarketAnalysis = can('MARKET_DATA', 'canRead');

  // Auto-open menus when inside their routes
  useEffect(() => {
    if (pathname.startsWith("/decision-support")) {
      setIsDecisionOpen(true);
    }
    if (pathname.startsWith("/access-control")) {
      setIsAccessControlOpen(true);
    }
  }, [pathname]);

  const handleLogout = async () => {
    setIsLogoutModalOpen(false);
    await logout();
    navigate("/login");
  };

  const navItemsPrimary = [
    { to: "/dashboard", icon: <FiTrendingUp />, label: "Dashboard" },
    { to: "/watchlist", icon: <FiActivity />, label: "Watchlist" },
    { to: "/market", icon: <FiHome />, label: "Market" },
    { to: "/forecast", icon: <FiTarget />, label: "Forecast" },
  ];

  const navItemsSecondary = [
    { to: "/news", icon: <FiFileText />, label: "News" },
    { to: "/settings", icon: <FiSettings />, label: "Settings" },
  ];

  const [isOpenMobile, setIsOpenMobile] = useState(false);

  return (
    <>
      {/* Mobile Toggle Button */}
      <Button 
        variant="outline"
        size="icon"
        onClick={() => setIsOpenMobile(!isOpenMobile)}
        className="lg:hidden fixed bottom-6 right-6 z-[120] w-14 h-14 rounded-full shadow-2xl transition-all bg-card border border-border text-primary hover:bg-muted active:scale-95"
      >
        {isOpenMobile ? <FiChevronLeft size={24} /> : <FiChevronRight size={24} />}
      </Button>

      {/* Backdrop for mobile */}
      {isOpenMobile && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] lg:hidden"
          onClick={() => setIsOpenMobile(false)}
        />
      )}

      <aside
        className={`
          flex flex-col h-screen lg:sticky fixed top-0 left-0 z-[110]
          bg-background border-r
          transition-all duration-300
          ${isCollapsed ? "w-16" : "w-64"}
          ${isOpenMobile ? "translate-x-0 shadow-2xl" : "-translate-x-full lg:translate-x-0"}
          lg:w-auto ${isCollapsed ? "lg:w-16" : "lg:w-64"}
        `}
      >
      {/* Floating Toggle Button */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={`group-toggle hidden lg:flex absolute -right-3 top-7 z-[120] w-6 h-6 rounded-full items-center justify-center transition-all duration-200 shadow-sm hover:scale-110 bg-background border-border text-muted-foreground hover:text-foreground`}
        title={isCollapsed ? 'Open sidebar' : 'Close sidebar'}
      >
        {isCollapsed ? <FiChevronRight size={12} /> : <FiChevronLeft size={12} />}
      </Button>

      {/* Logo */}
      <div className="flex items-center px-4 py-5 h-[60px]">
        <div className="flex items-center gap-3">
          <img src="/stockpros-logo.png" alt="Logo" className="w-10 h-10 object-contain" />
          {!isCollapsed && (
            <span className="text-lg font-bold">
              StockPros
            </span>
          )}
        </div>
      </div>


      {(!isAdmin || isPortfolioManager || isAnalyst) && (
        <div className={`px-4 mb-4 flex transition-all ${isCollapsed ? "justify-center" : "gap-2"}`}>
          <UnifiedNotifications />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto custom-scrollbar">
        {/* Primary Items */}
        {showStandardMenus && navItemsPrimary.map((item) => (
          <NavItem
            key={item.to}
            {...item}
            active={pathname.startsWith(item.to)}
            collapsed={isCollapsed}
          />
        ))}

        {/* -------- Decision Support (Collapsible) -------- */}
        {showStandardMenus && (
          <div className="mt-2">
            <button
              onClick={() => setIsDecisionOpen(!isDecisionOpen)}
              className={`flex items-center gap-3 px-3 py-2 rounded-md w-full transition-all
              ${pathname.startsWith("/decision-support")
                  ? "bg-secondary text-secondary-foreground font-medium"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                }
              ${isCollapsed ? "justify-center px-0" : ""}
            `}
            >
              <FiBarChart2 className="text-lg" />
              {!isCollapsed && (
                <>
                  <span className="text-sm font-medium">Decision Support</span>
                  <FiChevronDown
                    className={`ml-auto transition-transform ${isDecisionOpen ? "rotate-180" : ""
                      }`}
                  />
                </>
              )}
            </button>

            {!isCollapsed && isDecisionOpen && (
              <div className="ml-8 mt-1 space-y-1">
                <Link
                  to="/decision-support/radar"
                  onMouseEnter={() => preloader.preloadRoute("/decision-support/radar")}
                  onFocus={() => preloader.preloadRoute("/decision-support/radar")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition ${pathname === "/decision-support/radar"
                    ? "bg-secondary/50 text-foreground font-medium"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    }`}
                >
                  <FiRadio className="text-xs" />
                  AI Radar
                </Link>

                <Link
                  to="/decision-support/market-analysis"
                  onMouseEnter={() => preloader.preloadRoute("/decision-support/market-analysis")}
                  onFocus={() => preloader.preloadRoute("/decision-support/market-analysis")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition ${pathname === "/decision-support/market-analysis"
                    ? "bg-secondary/50 text-foreground font-medium"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    }`}
                >
                  <FiActivity className="text-xs" />
                  Market Analysis
                </Link>

                {isPortfolioManager && (
                  <Link
                    to="/decision-support/portfolio-health"
                    onMouseEnter={() => preloader.preloadRoute("/decision-support/portfolio-health")}
                    onFocus={() => preloader.preloadRoute("/decision-support/portfolio-health")}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition ${pathname === "/decision-support/portfolio-health"
                      ? "bg-secondary/50 text-foreground font-medium"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                      }`}
                  >
                    <FiBriefcase className="text-xs" />
                    Portfolio Health
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* Secondary Items */}
        {showStandardMenus && navItemsSecondary.map((item) => (
          <NavItem
            key={item.to}
            {...item}
            active={pathname.startsWith(item.to)}
            collapsed={isCollapsed}
          />
        ))}

        {/* -------- Access Control (Collapsible) -------- */}
        {canSeeAccessControl && (
          <div className="mt-2">
            <button
              onClick={() => {
                const willOpen = !isAccessControlOpen;
                setIsAccessControlOpen(willOpen);
                if (willOpen && canSeeUsers) {
                  navigate("/access-control/users");
                }
              }}
              className={`flex items-center gap-3 px-3 py-2 rounded-md w-full transition-all
                ${pathname.startsWith("/access-control")
                  ? "bg-secondary text-secondary-foreground font-medium"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                }
                ${isCollapsed ? "justify-center px-0" : ""}
              `}
            >
              <FiShield className="text-lg" />
              {!isCollapsed && (
                <>
                  <span className="text-sm font-medium">Access Control</span>
                  <FiChevronDown
                    className={`ml-auto transition-transform ${isAccessControlOpen ? "rotate-180" : ""
                      }`}
                  />
                </>
              )}
            </button>

            {!isCollapsed && isAccessControlOpen && (
              <div className="ml-8 mt-1 space-y-1">
                {canSeeUsers && (
                  <Link
                    to="/access-control/users"
                    onMouseEnter={() => preloader.preloadRoute("/access-control/users")}
                    onFocus={() => preloader.preloadRoute("/access-control/users")}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition ${pathname === "/access-control/users"
                      ? "bg-secondary/50 text-foreground font-medium"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                      }`}
                  >
                    <FiUsers className="text-xs" />
                    Users
                  </Link>
                )}

                {(isAdmin || can('ROLE', 'canRead')) && (
                  <Link
                    to="/access-control/roles"
                    onMouseEnter={() => preloader.preloadRoute("/access-control/roles")}
                    onFocus={() => preloader.preloadRoute("/access-control/roles")}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition ${pathname === "/access-control/roles"
                      ? "bg-secondary/50 text-foreground font-medium"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                      }`}
                  >
                    <FiShield className="text-xs" />
                    Roles
                  </Link>
                )}

                {(isAdmin || can('ROLE', 'canRead')) && (
                  <Link
                    to="/access-control/overview"
                    onMouseEnter={() => preloader.preloadRoute("/access-control/overview")}
                    onFocus={() => preloader.preloadRoute("/access-control/overview")}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition ${pathname === "/access-control/overview"
                      ? "bg-secondary/50 text-foreground font-medium"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                      }`}
                  >
                    <FiActivity className="text-xs" />
                    System Overview
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* ---------------- User & Logout ---------------- */}
      <div className="px-4 pb-6 mt-auto">
        {!isCollapsed && (
          <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-secondary/30">
            <Avatar className="w-10 h-10 shadow-sm">
              <AvatarImage src="" alt="User Avatar" />
              <AvatarFallback className="bg-primary text-primary-foreground font-bold select-none">
                {(() => {
                  const fullName = (user?.displayName || '').trim();
                  if (!fullName) return (user?.email?.charAt(0) || 'U').toUpperCase();
                  const parts = fullName.split(/\s+/).filter(Boolean);
                  if (parts.length >= 2) {
                    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                  }
                  return fullName.slice(0, 2).toUpperCase();
                })()}
              </AvatarFallback>
            </Avatar>
            <div className="overflow-hidden">
              <div className="text-sm font-medium text-foreground truncate">
                {(user?.displayName || user?.email || '')}
              </div>
              <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
            </div>
          </div>
        )}

        <Button
          variant="ghost"
          onClick={() => setIsLogoutModalOpen(true)}
          className={`flex items-center gap-2 transition w-full ${isCollapsed
            ? "justify-center p-2"
            : "px-3 justify-start font-normal"
            } text-muted-foreground hover:text-foreground`}
        >
          <FiLogOut className="h-5 w-5" />
          {!isCollapsed && <span className="text-sm">Log out</span>}
        </Button>
      </div>

      <LogoutModal
        isOpen={isLogoutModalOpen}
        onConfirm={handleLogout}
        onCancel={() => setIsLogoutModalOpen(false)}
      />
      </aside>
    </>
  );
};
