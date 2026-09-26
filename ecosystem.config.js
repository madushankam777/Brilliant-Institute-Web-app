// pm2 - keeps the API, website and Cloudflare tunnel running (npm i -g pm2)
module.exports = {
  apps: [
    // API on port 5000 (reads server/.env) - keeps retrying until MySQL is up
    { name: 'api', cwd: './server', script: 'src/server.js', exp_backoff_restart_delay: 3000 },
    // website on port 4173 (run "npm run build" in client first)
    { name: 'site', cwd: './client', script: 'node_modules/vite/bin/vite.js', args: 'preview' },
    // public https address - quick tunnel; see the URL with "pm2 logs tunnel"
    { name: 'tunnel', script: 'cloudflared', args: 'tunnel --url http://localhost:4173', interpreter: 'none' },
  ],
};
