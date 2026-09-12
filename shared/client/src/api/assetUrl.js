import httpClient from './httpClient';

const API_ORIGIN = (httpClient.defaults.baseURL || '').replace(/\/api\/?$/, '');

export function getAssetUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path}`;
}
