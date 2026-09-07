import api from "@/shared/api/axios";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { clearAccessToken, getAccessToken, setAccessToken } from "@/shared/utils/token";
import type { AuthContextValue, ScreenPermissions, User } from "../types";

// ------------------------
// AUTH CONTEXT
// ------------------------
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User>(null);
  const [screenPermissions, setScreenPermissions] = useState<Record<string, ScreenPermissions>>({});
  const [loading, setLoading] = useState(true);

  // ------------------------
  // /me
  // ------------------------
  const fetchMe = useCallback(async () => {
    let token = getAccessToken();

    // If no token (e.g. on page reload), try to refresh it
    if (!token) {
      try {
        const res = await api.post("/api/v1/auth/refresh-token");
        if (res.data?.accessToken) {
          setAccessToken(res.data.accessToken);
          token = res.data.accessToken;
        }
      } catch (err) {
        // Refresh failed, user probably not logged in or cookie expired
      }
    }

    if (!token) {
      setUser(null);
      setScreenPermissions({});
      setLoading(false);
      return;
    }

    try {
      const [meRes, screensRes] = await Promise.all([
        api.get("/api/v1/auth/me"),
        api.get("/api/v1/rbac/user-screens")
      ]);

      setUser(meRes.data?.user || meRes.data);
      setScreenPermissions(screensRes.data?.data || screensRes.data || {});
    } catch {
      setUser(null);
      setScreenPermissions({});
    } finally {
      setLoading(false);
    }
  }, []);

  // ------------------------
  // PASSWORDLESS MAGIC LINK
  // ------------------------
  const sendMagicLink = async (email: string): Promise<boolean> => {
    try {
      await api.post("/api/v1/auth/magic-link", { email });
      return true;
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to send magic link");
      return false;
    }
  };

  // ------------------------
  // LOGIN (Passwordless Magic Link)
  // ------------------------
  const login = async (email: string): Promise<boolean> => {
    return await sendMagicLink(email);
  };

  // ------------------------
  // REGISTER (Passwordless Magic Link)
  // ------------------------
  const register = async (payload: { email: string }) => {
    await sendMagicLink(payload.email);
  };

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // ------------------------
  // LOGOUT
  // ------------------------
  const logout = async () => {
    try {
      await api.post("/api/v1/auth/logout");
    } catch { }
    clearAccessToken();
    setUser(null);
    setScreenPermissions({});
  };



  const can = useCallback((resource: string, action: keyof ScreenPermissions) => {
    return !!screenPermissions[resource.toUpperCase()]?.[action];
  }, [screenPermissions]);

  const contextValue = useMemo(
    () => ({
      user,
      screenPermissions,
      loading,
      sendMagicLink,
      login,
      register,
      logout,
      can,
      refreshMe: fetchMe,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, screenPermissions, loading, can, fetchMe]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
