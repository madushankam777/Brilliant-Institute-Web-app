// Shared axios instance: sends cookies, handles 401s
import axios from 'axios';

// The only place the API base URL is read from - never hardcode it elsewhere.
// If VITE_API_BASE_URL isn't set, fall back to whatever host served this
// page (same hostname, API port) - this way the exact same build works
// whether it's opened as localhost or from another device via a LAN IP,
// with no per-environment config needed.
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:5000/api`;

const httpClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 15000,
});

const STATE_CHANGING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

httpClient.interceptors.request.use((requestConfig) => {
  const method = (requestConfig.method || 'get').toLowerCase();
  if (STATE_CHANGING_METHODS.has(method)) {
    requestConfig.headers['X-Requested-With'] = 'brilliant-institute-client';
  }
  return requestConfig;
});

// Lets AuthContext react to session expiry (e.g. redirect to /login) in one place.
let onSessionExpired = () => {};
export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

// A 401 here is an expected inline error (e.g. wrong password), not an expired session.
const AUTH_ENTRY_POINTS = ['/auth/login', '/auth/register'];

httpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response ? error.response.status : null;
    const requestUrl = error.config ? error.config.url : '';
    const isAuthEntryPoint = AUTH_ENTRY_POINTS.some((path) => requestUrl.includes(path));

    if (status === 401 && !isAuthEntryPoint) {
      onSessionExpired();
    }

    const serverMessage = error.response && error.response.data && error.response.data.message;
    const friendlyMessage =
      serverMessage || 'Something went wrong. Please check your connection and try again.';

    const details = error.response && error.response.data && error.response.data.details;

    return Promise.reject({ message: friendlyMessage, status, details });
  }
);

export default httpClient;
