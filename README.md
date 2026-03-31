# HomePlus

A self-hosted, multi-user AI chat application built on the OpenClaw ACP protocol. HomePlus enables multiple users to interact with an AI assistant through a modern web interface, with WebSocket-based real-time messaging.

[English](README.md) · [中文](README_zh.md)

---

## ✨ Features

- **Multi-user Chat** — Multiple users can join and chat simultaneously, each with their own session
- **Real-time Messaging** — WebSocket-based instant message delivery
- **AI-Powered** — Leverages MiniMax API for intelligent responses
- **Weather Intelligence** — Built-in weather queries with live data from wttr.in
- **Self-Hosted** — Run entirely on your own infrastructure
- **OpenClaw Integration** — Designed to work alongside the OpenClaw gateway ecosystem

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ (Node 22 recommended)
- npm 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/homeplus.git
cd homeplus

# Install dependencies
npm install

# Copy environment template and configure
cp .env.example .env
# Edit .env with your settings

# Start the server
npm start
```

### Configuration

Edit `.env` (see `.env.example`):

```env
PORT=18790
WS_PORT=18791
MINIMAX_API_KEY=your_api_key_here
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic/v1
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=your_gateway_token
```

### Run in Production

```bash
npm run build   # Build for production
npm start       # Start production server
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                    HomePlus                          │
├─────────────────────────────────────────────────────┤
│  HTTP Server (Port 18790)                           │
│  ├── Static Files (Web UI)                          │
│  └── REST API (/ai-response)                        │
├─────────────────────────────────────────────────────┤
│  WebSocket Server (Port 18791)                      │
│  ├── Authentication (User Login)                    │
│  ├── Message Broadcasting                           │
│  └── Session Management                             │
├─────────────────────────────────────────────────────┤
│  Chat Service Layer                                  │
│  ├── ChatService (MiniMax API direct calls)        │
│  └── WeatherService (wttr.in integration)           │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│              MiniMax API (External)                  │
└─────────────────────────────────────────────────────┘
```

### Key Components

| Component | Description |
|-----------|-------------|
| `src/server/index.js` | Main HTTP + WebSocket server |
| `src/server/chat-service.js` | Direct AI API integration |
| `src/server/openclaw-client.js` | OpenClaw Gateway client |
| `src/server/session-manager.js` | WebSocket session management |
| `src/server/user-manager.js` | User authentication |
| `src/client/` | Frontend web UI |

---

## 📖 Documentation

- [Specification](SPEC.md) — Detailed project specification
- [Architecture](docs/ARCHITECTURE.md) — System architecture deep dive
- [API Reference](docs/API.md) — HTTP/WebSocket API documentation
- [Deployment Guide](docs/DEPLOYMENT.md) — Production deployment instructions
- [Changelog](docs/CHANGELOG.md) — Version history

---

## 🌐 Related Projects

HomePlus is designed to complement the [OpenClaw](https://github.com/openclaw/openclaw) ecosystem. It can run independently or alongside an existing OpenClaw gateway installation.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

Built on the OpenClaw ACP protocol and powered by MiniMax API.
