# HomePlus Deployment Guide

## Prerequisites

- Node.js 18+ (Node 22 recommended)
- npm 9+
- A MiniMax API key

## Environment Configuration

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Server Ports
PORT=18790
WS_PORT=18791

# MiniMax API (required)
MINIMAX_API_KEY=your_minimax_api_key_here
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic/v1

# Session
SESSION_SECRET=change_this_to_a_random_secret

# Environment
NODE_ENV=production
```

### Getting a MiniMax API Key

1. Sign up at [MiniMax Platform](https://platform.minimaxi.com)
2. Create a new API key in your dashboard
3. Copy the key and paste it into `MINIMAX_API_KEY`

## Running in Production

### Method 1: Direct Node.js

```bash
# Install dependencies
npm install

# Set environment
export NODE_ENV=production
export PORT=18790
export WS_PORT=18791
export MINIMAX_API_KEY=your_key_here

# Start
npm start
```

### Method 2: PM2 (Recommended for Production)

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start src/server/index.js --name homeplus

# Enable startup script
pm2 startup
pm2 save
```

**PM2 configuration (`ecosystem.config.js`):**

```javascript
module.exports = {
  apps: [{
    name: 'homeplus',
    script: 'src/server/index.js',
    env: {
      NODE_ENV: 'production',
      PORT: 18790,
      WS_PORT: 18791,
      MINIMAX_API_KEY: 'your_key_here',
      MINIMAX_BASE_URL: 'https://api.minimaxi.com/anthropic/v1'
    }
  }]
};
```

### Method 3: Docker

**Dockerfile:**

```dockerfile
FROM node:22-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 18790 18791

CMD ["node", "src/server/index.js"]
```

**Build and run:**

```bash
docker build -t homeplus .
docker run -d \
  --name homeplus \
  -p 18790:18790 \
  -p 18791:18791 \
  -e MINIMAX_API_KEY=your_key_here \
  homeplus
```

## Reverse Proxy Configuration

For production, it is recommended to run HomePlus behind a reverse proxy (nginx, Caddy, etc.) with HTTPS.

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # HTTP to HTTPS redirect
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    # Static files
    location / {
        proxy_pass http://127.0.0.1:18790;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket
    location /ws {
        proxy_pass http://127.0.0.1:18791;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Caddy

```caddy
your-domain.com {
    reverse_proxy / /* 127.0.0.1:18790
    reverse_proxy /ws /* 127.0.0.1:18791
}
```

## Firewall Configuration

Ensure the following ports are open:

| Port | Protocol | Purpose |
|------|----------|---------|
| 18790 | TCP | HTTP server (Web UI + REST API) |
| 18791 | TCP | WebSocket server |

For local network access only:

```bash
# Ubuntu/Debian
sudo ufw allow 18790/tcp
sudo ufw allow 18791/tcp
```

## Health Checks

### HTTP Health Check

```bash
curl http://localhost:18790/health
```

Expected response:

```json
{ "status": "ok" }
```

### WebSocket Connection Test

```javascript
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:18791');

ws.on('open', () => {
  console.log('Connected');
  ws.close();
});
```

## Log Management

HomePlus outputs logs to stdout. For production, redirect to a log file:

```bash
# Using systemd
journalctl --user -u homeplus -f

# Using PM2
pm2 logs homeplus

# Direct redirect
nohup node src/server/index.js > /var/log/homeplus.log 2>&1 &
```

## Security Checklist

- [ ] Change `SESSION_SECRET` from default
- [ ] Use HTTPS (never serve over plain HTTP in production)
- [ ] Set `NODE_ENV=production`
- [ ] Keep `MINIMAX_API_KEY` secret (not in version control)
- [ ] Configure firewall to restrict access
- [ ] Regular backups of user data (`data/users.json`)

## Troubleshooting

### "Connection refused" on WebSocket

Check that port 18791 is not blocked by firewall and the service is running:

```bash
ss -tlnp | grep 18791
```

### "AI service temporarily unavailable"

- Verify `MINIMAX_API_KEY` is correct
- Check API key has sufficient quota
- Test API directly: `curl -X POST https://api.minimaxi.com/anthropic/v1/messages ...`

### Weather queries return "暂时无法获取"

- wttr.in may be blocked in your region
- Check network connectivity to `wttr.in`
- Consider deploying your own wttr.in mirror
