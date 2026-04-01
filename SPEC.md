# HomePlus Project Specification

**Version:** 1.2.0  
**Last Updated:** 2026-04-01

---

## 1. Project Overview

**Project Name:** HomePlus  

**Project Type:** Self-hosted multi-user AI chat application  

**Core Functionality:** A web-based chat platform that enables multiple users to simultaneously interact with an AI assistant, featuring real-time WebSocket messaging, persistent conversation history, and **multi-model support** (MiniMax + DeepSeek).

**Target Users:** Teams and individuals who want a self-hosted AI chat solution with multi-user support and model flexibility.

---

## 2. Technical Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 18+ |
| HTTP Server | Node.js built-in `http` module |
| WebSocket | `ws` library |
| Authentication | Custom session-based with bcrypt password hashing |
| AI Backend | MiniMax API (Anthropic-compatible) + DeepSeek API (OpenAI-compatible) |

---

## 3. System Architecture

### 3.1 Server Components

```
HTTP Server (port 18790)
├── Static File Serving (src/client/)
└── REST API
    └── POST /ai-response (receives AI responses from external bridge, HMAC-protected)

WebSocket Server (port 18791)
├── Authentication Handshake
├── Message Routing
├── Session Management
└── Auto Reconnection (gateway)

Chat Service Layer
└── ChatService — Direct AI API calls (MiniMax + DeepSeek) with persistent conversation history
```

### 3.2 Client Components

```
Web Browser
└── Single-page application
    ├── Login Screen (with credential persistence for auto-reconnect)
    ├── Chat Interface
    ├── Model Selector (sidebar)
    └── Message Display (with typing indicator)
```

### 3.3 Data Flow

```
User → WebSocket → HomePlus Server → AI API (MiniMax or DeepSeek)
                                           ↓
User ← WebSocket ← HomePlus Server ← AI Response
```

---

## 4. Functionality Specification

### 4.1 User Authentication

- **Registration:** Username + password (bcrypt hashed, cost factor 10)
- **Login:** Username + password → session token
- **Sessions:** In-memory session tokens with configurable expiry
- **Default Users:** `testuser` (password: `test123`)
- **Credential Persistence:** Login credentials stored in sessionStorage for auto-reconnect after session expiry

### 4.2 Chat Features

- **Real-time messaging** via WebSocket
- **Message history** persisted to `data/conversation-history.json` (survives server restart)
- **AI responses** via configurable AI backend (MiniMax or DeepSeek)
- **Model selection:** Users can switch between 4 models in real-time:
  - MiniMax-M2.7-highspeed (default, fast)
  - MiniMax-M2.7 (standard)
  - DeepSeek V3 (code-strong, cost-efficient)
  - DeepSeek R1 (reasoning, complex tasks)
- **Thinking indicator:** Animated typing indicator while AI is processing
- **Message format:** JSON with type, id, content, from, timestamp, parentId, model

### 4.3 Conversation History

- **Persistence:** History stored in `data/conversation-history.json`
- **Auto-save:** Changes saved to disk every 30 seconds (debounced)
- **History per session:** Each session maintains its own conversation context
- **Context window:** Last 20 messages + system prompt preserved

### 4.4 Multi-Model Architecture

- **Provider routing:** Model name → API endpoint/credentials resolved dynamically
- **MiniMax:** Anthropic-compatible API, uses `MiniMax-M2.7` / `MiniMax-M2.7-highspeed`
- **DeepSeek:** OpenAI-compatible API, uses `deepseek-chat` / `deepseek-reasoner`
- **Per-message model:** Each chat message can specify a different model
- **Session persistence:** Model preference stored in browser sessionStorage, restored on reconnect

### 4.5 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/ai-response` | Receives AI responses from external bridge (HMAC-SHA256 protected) |
| GET | `/` | Serves web UI |
| GET | `/*` | Serves static files |

### 4.6 WebSocket Protocol

**Connection:** `ws://host:18791`

**Message Types (Client → Server):**

| Type | Fields | Description |
|------|--------|-------------|
| `register` | username, password | Create new account |
| `login` | username, password | Login |
| `message` | content, id, model (optional) | Send chat message |
| `history` | limit (optional) | Request message history |
| `ping` | — | Keepalive ping |
| `logout` | — | End session |

**Message Types (Server → Client):**

| Type | Fields | Description |
|------|--------|-------------|
| `auth_success` | username, sessionKey | Login successful |
| `auth_error` | message | Login failed |
| `connected` | sessionKey | Session attached to gateway |
| `message` | id, content, from, timestamp, parentId, pending | Chat message |
| `status` | status, message | Connection status update |
| `pong` | timestamp | Ping response |
| `error` | id, message | Error message |

---

## 5. Security Considerations

- `/ai-response` endpoint protected by HMAC-SHA256 signature verification
- Replay protection: requests older than 5 minutes are rejected
- API keys stored in environment variables, never in code
- Passwords hashed with bcrypt (cost factor 10)
- WebSocket session tokens (in-memory, not persistent across server restarts)
- Credentials for auto-reconnect stored in sessionStorage (not localStorage)

---

## 6. Known Limitations

- **Single AI backend per message** — cannot fan-out to multiple models simultaneously
- **WebSocket session expiry** — connections may expire; client auto-reconnects and re-authenticates
- **Session attachment** requires OpenClaw gateway with `operator.admin` scope (not available in current setup)

---

## 7. Future Considerations

- Persistent session tokens (survive server restart)
- User avatars and profiles
- Message reactions and threading
- Channel/room support for multiple chat rooms
- Admin panel for user management
- Additional AI backend support (OpenAI, Anthropic, etc.)
