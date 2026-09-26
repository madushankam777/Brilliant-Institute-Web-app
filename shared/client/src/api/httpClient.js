// Shared axios instance: sends cookies, handles 401s
import axios from 'axios';

// API base URL (relative - the dev server proxies /api)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const httpClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 15000,
});

const STATE_CHANGING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

// how many requests are running - drives the top loading bar
let activeRequests = 0;
const activityListeners = new Set();
function setActive(change) {
  activeRequests = Math.max(0, activeRequests + change);
  activityListeners.forEach((listener) => listener(activeRequests));
}
export function onRequestActivity(listener) {
  activityListeners.add(listener);
  return () => activityListeners.delete(listener);
}

httpClient.interceptors.request.use((requestConfig) => {
  setActive(1);
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

// read the error message out of a blob download
async function readErrorBody(error) {
  const data = error.response && error.response.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      return JSON.parse(await data.text());
    } catch {
      return {};
    }
  }
  return data || {};
}

httpClient.interceptors.response.use(
  (response) => {
    setActive(-1);
    return response;
  },
  async (error) => {
    setActive(-1);
    const status = error.response ? error.response.status : null;
    const requestUrl = error.config ? error.config.url : '';
    const isAuthEntryPoint = AUTH_ENTRY_POINTS.some((path) => requestUrl.includes(path));

    if (status === 401 && !isAuthEntryPoint) {
      onSessionExpired();
    }

    const body = await readErrorBody(error);
    const serverMessage = body.message;
    const friendlyMessage =
      serverMessage || 'Something went wrong. Please check your connection and try again.';

    return Promise.reject({ message: friendlyMessage, status, details: body.details });
  }
);

export default httpClient;
