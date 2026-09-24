// Shared axios instance: sends cookies, handles 401s
import axios from 'axios';

// The only place the API base URL is read from - never hardcode it elsewhere.
// A plain relative path by default: the dev server proxies /api to the
// backend (see vite.config.js), so the browser only ever talks to the one
// origin it loaded the page from. That makes the exact same build work
// unchanged whether it's opened as localhost, a LAN IP, or a public tunnel
// URL - and it's required for cookies to work at all through a tunnel,
// since a separate backend origin would make every request cross-site.
// Set VITE_API_BASE_URL only if the API is genuinely served elsewhere.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

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

// A file download (responseType: 'blob') gets its error body as a Blob too,
// so the server's message has to be read back out of it or it is lost.
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
  (response) => response,
  async (error) => {
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
