// dev only - trust private LAN addresses on the Vite port
const PRIVATE_LAN_HOSTNAME = /^(127\.0\.0\.1|localhost|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})$/;
// the Vite dev server port
const DEV_CLIENT_PORT = '5173';

// true for a development website on this computer or the local network (never in production)
function isTrustedDevOrigin(origin, isProduction) {
  if (isProduction || !origin) return false;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  return (
    url.protocol === 'http:' &&
    url.port === DEV_CLIENT_PORT &&
    PRIVATE_LAN_HOSTNAME.test(url.hostname)
  );
}

module.exports = { isTrustedDevOrigin };
