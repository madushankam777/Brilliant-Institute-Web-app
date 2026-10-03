// turns a saved file's path (a profile picture, a receipt) into a full web address
import httpClient from './httpClient';

// the server address without /api
const API_ORIGIN = (httpClient.defaults.baseURL || '').replace(/\/api\/?$/, '');

// full address for a saved file path (a full web address is left as it is)
export function getAssetUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path}`;
}
