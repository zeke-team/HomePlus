# HomePlus Project Specification

**Version:** 1.0.0  
**Last Updated:** 2026-03-31

---

## 1. Project Overview

**Project Name:** HomePlus  
**Project Type:** Self-hosted multi-user AI chat application  
**Core Functionality:** A web-based chat platform that enables multiple users to simultaneously interact with an AI assistant powered by MiniMax API, featuring real-time WebSocket messaging and built-in weather intelligence.  
**Target Users:** Teams and individuals who want a self-hosted AI chat solution with multi-user support.

---

## 2. Technical Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 18+ |
| HTTP Server | Node.js built-in `http` module |
| WebSocket | `ws` library |
| Authentication | Custom session-based with bcrypt password hashing |
| AI Backend | MiniMax API (Anthropic-compatible) |
| Weather Data | wttr.in (no API key required) |

---

## 3. System Architecture

### 3.1 Server Components

```
HTTP Server (port 18790)
├── Static File Serving (src/client/)
└── REST API
    └── POST /ai-response (receives AI responses from bridge)

WebSocket Server (port 18791)
├── Authentication Handshake
├── Message Routing
└── Session Management

Chat Service Layer
├── ChatService — Direct MiniMax API calls
└── WeatherService — wttr.in integration
```

### 3.2 Client Components

```
Web Browser
└── Single-page application
    ├── Login Screen
    ├── Chat Interface
    └── Message Display
```

### 3.3 Data Flow

```
User → WebSocket → HomePlus Server → MiniMax API
                                           ↓
User ← WebSocket ← HomePlus Server ← AI Response
```

---

## 4. Functionality Specification

### 4.1 User Authentication

- **Registration:** Username + password (bcrypt hashed)
- **Login:** Username + password → session token
- **Sessions:** In-memory session tokens with configurable expiry
- **Default Users:** `testuser` (for testing only)

### 4.2 Chat Features

- **Real-time messaging** via WebSocket
- **Message history** maintained in server memory (per session)
- **AI responses** via MiniMax API (MiniMax-M2.7-highspeed model)
- **Message format:** JSON with type, id, content, from, timestamp, parentId

### 4.3 Weather Intelligence

- **Automatic detection:** Messages containing weather keywords trigger weather enrichment
- **Supported queries:** "天气", "weather", "温度", "temperature", etc.
- **Data source:** wttr.in (no API key required)
- **City mapping:** Supports major Chinese and English city names

### 4.4 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/ai-response` | Receives AI responses from external bridge |
| GET | `/` | Serves web UI |
| GET | `/*` | Serves static files |

### 4.5 WebSocket Protocol

**Connection:** `ws://host:18791`

**Message Types (Client → Server):**

| Type | Fields | Description |
|------|--------|-------------|
| `register` | username, password | Create new account |
| `login` | username, password | Login |
| `message` | content, id | Send chat message |
| `history` | limit (optional) | Request message history |

**Message Types (Server → Client):**

| Type | Fields | Description |
|------|--------|-------------|
| `auth_success` | username, sessionKey | Login/register success |
| `auth_error` | message | Authentication failed |
| `message` | id, content, from, timestamp | Chat message received |
| `error` | message | Error occurred |
| `status` | status, message | Connection status update |

---

## 5. Configuration

All configuration via environment variables (`.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 18790 | HTTP server port |
| `WS_PORT` | 18791 | WebSocket server port |
| `MINIMAX_API_KEY` | — | MiniMax API key (required) |
| `MINIMAX_BASE_URL` | — | MiniMax API base URL |
| `OPENCLAW_GATEWAY_URL` | ws://127.0.0.1:18789 | OpenClaw Gateway URL |
| `OPENCLAW_GATEWAY_TOKEN` | — | OpenClaw Gateway token |
| `SESSION_SECRET` | random | Session signing secret |
| `NODE_ENV` | development | Environment mode |

---

## 6. Security Considerations

- Passwords are hashed with bcrypt (cost factor 10)
- Session tokens are cryptographically random UUIDs
- Input validation on all user-provided data
- No SQL database (avoids injection risks)
- API keys stored in environment variables, not in code
- `.env` file excluded from version control

---

## 7. File Structure

```
HomePlus/
├── src/
│   ├── client/           # Frontend web UI
│   │   └── index.html
│   ├── server/           # Backend server code
│   │   ├── index.js      # Main entry point
│   │   ├── chat-service.js
│   │   ├── openclaw-client.js
│   │   ├── session-manager.js
│   │   └── user-manager.js
│   └── shared/
│       └── protocol.js   # Shared constants
├── docs/                 # Documentation
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── DEPLOYMENT.md
│   └── CHANGELOG.md
├── .env.example
├── .gitignore
├── package.json
├── SPEC.md
├── README.md
└── LICENSE
```

---

## 8. Known Limitations

- **Message history** is in-memory only and resets on server restart
- **No persistent storage** for user data beyond password hashes
- **Single AI backend** — only MiniMax API supported currently
- **Session attachment** requires OpenClaw gateway with `operator.admin` scope (not available in current setup)
- **Weather data** from wttr.in may be unavailable in some regions

---

## 9. Future Considerations

- Persistent message history (SQLite/PostgreSQL)
- Additional AI backend support (OpenAI, Anthropic, etc.)
- User avatars and profiles
- Message reactions and threading
- Channel/room support for multiple chat rooms
- Admin panel for user management
