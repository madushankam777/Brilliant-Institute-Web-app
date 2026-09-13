// Home/office routers hand out a new LAN IP on reboot, which would silently
// break CORS every time (re-editing CLIENT_ORIGIN by hand doesn't scale).
// In development only, also trust any private-network address talking to
// the known Vite dev port - still far narrower than "*": an attacker would
// already need to be on the same LAN, and it never applies in production.
const PRIVATE_LAN_HOSTNAME = /^(127\.0\.0\.1|localhost|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})$/;
const DEV_CLIENT_PORT = '5173';

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
