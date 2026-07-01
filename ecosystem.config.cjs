// PM2 process definitions for the adlink production deploy on the shared VPS.
// Names are prefixed `adlink-` so they never collide with other apps' PM2 entries.
const path = require('path');
const ROOT = __dirname;

module.exports = {
  apps: [
    {
      name: 'adlink-api',
      // run from apps/api so Nest's ConfigModule envFilePath ('../../.env')
      // resolves to the repo-root .env
      cwd: path.join(ROOT, 'apps/api'),
      script: 'dist/main.js',
      node_args: '--enable-source-maps',
      env: { NODE_ENV: 'production' },
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: 'adlink-web',
      cwd: path.join(ROOT, 'apps/web'),
      // pnpm resolves the workspace-local next binary
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3070',
      env: { NODE_ENV: 'production', PORT: '3070' },
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};
