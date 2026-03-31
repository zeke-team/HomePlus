# HomePlus API Reference

## HTTP API

### POST `/ai-response`

Receives AI responses from external sources (e.g., OpenClaw agent bridge). Used for integrating HomePlus with external AI systems.

**Request:**

```http
POST /ai-response HTTP/1.1
Host: localhost:18790
Content-Type: application/json

{
  "content": "AI response text here",
  "from": "bot",
  "sessionKey": "homeplus:main"
}
```

**Response:**

```json
{ "ok": true }
```

**Error Response:**

```json
{ "error": "Error message" }
```

---

## WebSocket Protocol

### Connection

```
ws://localhost:18791
```

No authentication token required at connection time. Users authenticate via the `login` or `register` message after connecting.

---

### Client → Server Messages

#### `register` — Create Account

```json
{
  "type": "register",
  "username": "testuser",
  "password": "test123",
  "id": "msg-001"
}
```

**Response (Server → Client):**

```json
{
  "type": "auth_success",
  "username": "testuser",
  "sessionKey": "homeplus:testuser",
  "success": true,
  "message": "Registration successful"
}
```

**Error:**

```json
{
  "type": "auth_error",
  "message": "Username already exists"
}
```

---

#### `login` — Authenticate

```json
{
  "type": "login",
  "username": "testuser",
  "password": "test123",
  "id": "msg-002"
}
```

**Response (Server → Client):**

```json
{
  "type": "auth_success",
  "username": "testuser",
  "sessionKey": "homeplus:testuser",
  "success": true,
  "message": "Login successful"
}
```

**Error:**

```json
{
  "type": "auth_error",
  "message": "Invalid credentials"
}
```

---

#### `message` — Send Chat Message

```json
{
  "type": "message",
  "content": "你好，今天天气怎么样？",
  "id": "msg-003"
}
```

**Response (Server → Client):**

```json
{
  "type": "message",
  "id": "msg-003-echo",
  "content": "你好，今天天气怎么样？",
  "from": "user",
  "timestamp": 1743424800000,
  "pending": true
}
```

**AI Response (Server → Client):**

```json
{
  "type": "message",
  "id": "ai-msg-004",
  "content": "北京目前的天气情况如下：多云（⛅）+2°C（体感温度 -1°C），湿度 87%，降水 0.0mm。外出建议穿上保暖衣物...",
  "from": "bot",
  "timestamp": 1743424801000,
  "parentId": "msg-003"
}
```

---

#### `history` — Request Message History

```json
{
  "type": "history",
  "limit": 50,
  "id": "msg-004"
}
```

**Response (Server → Client):**

```json
{
  "type": "history_response",
  "messages": [
    {
      "id": "msg-001",
      "content": "你好",
      "from": "user",
      "timestamp": 1743424700000
    },
    {
      "id": "ai-msg-002",
      "content": "你好！有什么我可以帮助你的吗？",
      "from": "bot",
      "timestamp": 1743424701000,
      "parentId": "msg-001"
    }
  ],
  "id": "msg-004"
}
```

---

### Server → Client Messages (Push)

#### `status` — Connection Status

```json
{
  "type": "status",
  "status": "connected",
  "message": "Connected to AI service"
}
```

#### `error` — Error Notification

```json
{
  "type": "error",
  "message": "AI service temporarily unavailable"
}
```

---

## Message Type Constants

### Client-to-Server

| Type | Required Fields | Description |
|------|---------------|-------------|
| `register` | username, password | Create new user account |
| `login` | username, password | Authenticate user |
| `message` | content | Send chat message |
| `history` | — | Request message history |

### Server-to-Client

| Type | Fields | Description |
|------|--------|-------------|
| `auth_success` | username, sessionKey | Authentication succeeded |
| `auth_error` | message | Authentication failed |
| `message` | id, content, from, timestamp | Chat message |
| `history_response` | messages | History messages |
| `error` | message | Error occurred |
| `status` | status, message | Status update |

---

## Sender Types

| Value | Description |
|-------|-------------|
| `user` | Message from a regular user |
| `bot` | Message from the AI assistant |

---

## Status Codes

| Status | Description |
|--------|-------------|
| `connected` | Successfully connected to AI service |
| `disconnected` | Disconnected from AI service |
| `error` | Error connecting to AI service |
