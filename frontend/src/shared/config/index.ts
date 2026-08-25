// src/config.ts
const getDynamicApiUrl = () => {
  if (
    typeof window !== 'undefined' &&
    window.location.hostname &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  return import.meta.env.VITE_API_URL || 'http://localhost:3001';
};

export const API_URL = getDynamicApiUrl();
export const HEALTH_CHECK_URL = `${API_URL}/api/v1/health`;