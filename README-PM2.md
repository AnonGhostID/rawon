# Running Rawon Bot with PM2

This guide explains how to run the Rawon Discord bot using PM2 with auto-restart **enabled**, so the bot will automatically restart when it crashes.

## Prerequisites

1. Install PM2 globally if you haven't already:
   ```bash
   npm install -g pm2
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Build the project (required — `index.js` loads from `./dist/index.js`):
   ```bash
   pnpm build
   ```

4. Make sure you have completed the bot setup (`.env` file configured).

## Method 1: Using the Ecosystem Config (Recommended)

From the project directory (`/root/rawon`), start the bot using the existing `ecosystem.config.cjs`:

```bash
pm2 start ecosystem.config.cjs
```

The config already has `autorestart: true`, `max_restarts: 10`, and `max_memory_restart: '512M'` set, so the bot will automatically restart on crash or memory limit.

## Method 2: One-Liner CLI Command

From the project directory, start the bot with a single command:

```bash
pm2 start index.js --name "rawon" --interpreter node --interpreter-args "--es-module-specifier-resolution=node -r dotenv/config"
```

Auto-restart is enabled by default in PM2, so the bot will automatically restart when it crashes.

## Common PM2 Commands

| Command | Description |
|---------|-------------|
| `pm2 list` | Show all running processes |
| `pm2 logs rawon` | View real-time logs |
| `pm2 logs rawon --lines 100` | View last 100 lines of logs |
| `pm2 stop rawon` | Stop the bot |
| `pm2 restart rawon` | Manually restart the bot |
| `pm2 delete rawon` | Remove the bot from PM2 |
| `pm2 monit` | Monitor all PM2 processes |
| `pm2 status` | Show detailed process status |

## Saving PM2 Process List

To ensure PM2 remembers your bot process and restarts it after a server reboot:

```bash
pm2 save && pm2 startup
```

Follow the instructions printed by `pm2 startup` to complete the setup.

## Viewing Logs

```bash
pm2 logs rawon
```

Or view the log files directly:

```bash
cat /root/rawon/bot.log
cat /root/rawon/bot-error.log
```

## Troubleshooting

### Bot not starting

1. Check if `.env` file exists and is properly configured
2. Ensure dependencies are installed: `pnpm install`
3. Ensure the project is built: `pnpm build`
4. Check logs for errors: `pm2 logs rawon --err`

### Bot not auto-restarting

Make sure the process was started with auto-restart enabled. Delete and re-add it:

```bash
pm2 delete rawon && pm2 start ecosystem.config.cjs
```
