module.exports = {
  apps: [
    {
      name: 'rawon',
      cwd: '/root/rawon',
      script: 'index.js',
      interpreter: 'node',
      interpreter_args: '--es-module-specifier-resolution=node -r dotenv/config',
      autorestart: true,
      restart_delay: 10000,
      max_restarts: 10,
      max_memory_restart: '1024M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      out_file: '/root/rawon/bot.log',
      error_file: '/root/rawon/bot-error.log',
      kill_timeout: 10000
    }
  ]
};
