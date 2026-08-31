// src/config.ts
let _apiUrl = import.meta.env.VITE_API_URL;
if (typeof window !== 'undefined' && _apiUrl && _apiUrl.includes('localhost') && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
  _apiUrl = _apiUrl.replace('localhost', window.location.hostname);
}
export const API_URL = _apiUrl;
export const HEALTH_CHECK_URL = import.meta.env.VITE_HEALTH_CHECK_URL;
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;