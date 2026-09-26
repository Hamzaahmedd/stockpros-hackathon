// src/api/axios.ts
import axios, { AxiosError, AxiosRequestConfig } from "axios";
import { clearAccessToken, getAccessToken, setAccessToken } from "@/shared/utils/token";
import { API_URL } from "../config";
import { toast } from "react-toastify";

const PLAN_GATED_ERROR_CODES = new Set(["QuotaExceededError", "PlanRequiredError"]);

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// REQUEST INTERCEPTOR

// Add Authorization header automatically
api.interceptors.request.use((config) => {
  const token = getAccessToken(); // function to read token from memory
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// REFRESH TOKEN LOGIC

let isRefreshing = false;
let queue: Array<{ resolve: (value?: unknown) => void; reject: (reason?: unknown) => void }> = [];

const processQueue = (err: any) => {
  queue.forEach((p) => (err ? p.reject(err) : p.resolve(null)));
  queue = [];
};

// RESPONSE INTERCEPTOR

api.interceptors.response.use(
  res => res,
  async (err: AxiosError) => {
    const original = err.config as AxiosRequestConfig & { _retry?: boolean };
    const url = original.url || "";

    // 1) If /me returns 401 and user has no accessToken, do NOT refresh
    if (url.includes("api/v1/auth/me")) {
      return Promise.reject(err);
    }

    // Surface plan/quota gating as an upsell toast pointing at /plans, for any
    // request that hits a Free-tier limit (forecast quota, watchlist cap,
    // decision-support watchlist-only restriction, Pro-only feature lock).
    const errorCode = (err.response?.data as any)?.errorCode;
    if (errorCode && PLAN_GATED_ERROR_CODES.has(errorCode)) {
      const message = (err.response?.data as any)?.message || "This requires a Pro plan";
      toast.warn(`${message} — visit Plans to upgrade to Pro`);
    }

    // 2) Only refresh for protected APIs
    if (err.response?.status === 401 && !original._retry) {
      if (!getAccessToken()) {
        return Promise.reject(err);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject });
        }).then(() => api(original));
      }

      original._retry = true;
      isRefreshing = true;
      try {
        const refreshRes = await axios.post(`${API_URL}/api/v1/auth/refresh-token`, {}, { withCredentials: true });

        if (refreshRes.data?.accessToken) {
          setAccessToken(refreshRes.data.accessToken);
        }
        processQueue(null);
        return api(original);

      } catch (e) {
        clearAccessToken();
        processQueue(e);
        return Promise.reject(e);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(err);
  }
);


export default api;
