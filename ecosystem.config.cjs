module.exports = {
  apps: [
    {
      name: 'smartcity',
      script: 'src/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx/esm',
      cwd: 'C:\\smartcity',
      watch: false,
      exec_mode: 'fork',
      max_memory_restart: '500M',
      max_restarts: 10,
      min_uptime: '10s',
      autorestart: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
