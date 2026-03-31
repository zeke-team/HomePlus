# HomePlus Architecture

## Overview

HomePlus is a layered architecture consisting of three main tiers:

1. **Presentation Layer** — Web browser (single-page application)
2. **Service Layer** — HTTP + WebSocket server with business logic
3. **Integration Layer** — External AI API calls (MiniMax)

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser Clients                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   User A     │  │   User B     │  │   User C     │          │
│  │  (testuser)  │  │  (testuser2) │  │  (testuser3) │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │ WebSocket        │ WebSocket        │ WebSocket         │
└─────────┼──────────────────┼──────────────────┼──────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     HomePlus Server                               │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │              HTTP Server (Port 18790)                      │   │
│  │  ┌─────────────┐    ┌─────────────┐                      │   │
│  │  │ Static Files │    │ REST API    │                      │   │
│  │  │  (Web UI)   │    │/ai-response │                      │   │
│  │  └─────────────┘    └─────────────┘                      │   │
│  └───────────────────────────────────────────────────────────┘   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │           WebSocket Server (Port 18791)                    │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │Auth Handler  │  │Message Router│  │Session Mgr   │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │   │
│  └───────────────────────────────────────────────────────────┘   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                 Service Layer                              │   │
│  │  ┌──────────────────┐  ┌──────────────────────────────┐  │   │
│  │  │  ChatService     │  │  OpenClawClient (optional)  │  │   │
│  │  │  (MiniMax API)   │  │  (Gateway, disabled)        │  │   │
│  │  └──────────────────┘  └──────────────────────────────┘  │   │
│  │  ┌──────────────────┐                                   │   │
│  │  │  WeatherService  │                                   │   │
│  │  │  (wttr.in)       │                                   │   │
│  │  └──────────────────┘                                   │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                              │
│  ┌─────────────────────┐    ┌─────────────────────────────┐     │
│  │   MiniMax API       │    │   wttr.in (Weather)         │     │
│  │   api.minimaxi.com │    │   wttr.in                   │     │
│  └─────────────────────┘    └─────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## Message Flow

### User Sends a Message

```
1. User types message in browser
2. WebSocket sends: { type: "message", content: "你好", id: "uuid" }
3. Server receives message
4. Server checks weather keywords
5. If weather query:
   a. WeatherService.fetchWeather() → live weather data
   b. Message enriched with weather context
6. ChatService.chat() → MiniMax API
7. MiniMax returns AI response
8. Server broadcasts: { type: "message", content: "...", from: "bot" }
9. All authenticated clients receive the message
```

### Weather Query Enrichment

```
User: "北京今天天气怎么样？"

    │
    ▼
┌─────────────────────────────┐
│   WeatherService             │
│   isWeatherQuery() → true   │
│   extractLocation() → 北京   │
│   fetchWeather(北京)         │
│   → "Beijing: ⛅ +2°C..."    │
└─────────────────────────────┘
    │
    ▼
Enriched Message:
"[用户询问天气] 地点: 北京
当前天气: Beijing: ⛅ +2°C (feels like -1°C)...

用户问题: 北京今天天气怎么样？

请根据以上天气数据回答用户的问题。"

    │
    ▼
MiniMax API → AI Response
```

## Session Management

Each WebSocket connection goes through:

```
Connection → Authentication → Session Creation → Message Handling
```

Sessions are stored in-memory in `SessionManager`. Each session contains:
- `clientId` — unique identifier
- `username` — authenticated user
- `ws` — WebSocket reference
- `sessionKey` — used for AI context

## File Responsibilities

| File | Responsibility |
|------|----------------|
| `index.js` | HTTP + WebSocket server, request routing |
| `chat-service.js` | MiniMax API calls, message history |
| `session-manager.js` | WebSocket session tracking |
| `user-manager.js` | User registration, login, password hashing |
| `openclaw-client.js` | OpenClaw gateway client (disabled) |
| `protocol.js` | Shared message type constants |

## Data Storage

| Data | Storage |
|------|---------|
| User accounts | `data/users.json` (bcrypt hashes) |
| Session tokens | In-memory `Map` |
| Message history | In-memory per session (ChatService) |
| Config | Environment variables (`.env`) |

---

## Design Decisions

### Why Direct API Instead of OpenClaw Gateway?

HomePlus uses direct MiniMax API calls rather than routing through the OpenClaw gateway because:

1. **No scope requirements** — The OpenClaw gateway's `session.attach`, `sessions.subscribe`, and `chat.history` all require specific operator scopes that may not be available in all deployments.
2. **Simpler dependency chain** — Direct API calls reduce the number of failure points.
3. **Weather integration** — The chat-service can intelligently enrich weather queries before sending to the AI, something not easily achievable through the gateway.

### Why WebSocket for Messaging?

WebSocket provides:
- **Bidirectional communication** — Both client and server can send messages freely
- **Low latency** — No polling overhead
- **Real-time delivery** — Messages arrive instantly when sent
- **Persistent connections** — No need to re-establish connection per message

### Why In-Memory Storage?

For simplicity and rapid development:
- No database setup required
- Zero configuration for users
- Sufficient for development and small deployments

Production deployments should consider adding persistent storage.
