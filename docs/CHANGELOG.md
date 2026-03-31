# Changelog

All notable changes to HomePlus will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.0.0] — 2026-03-31

### Added

- **Multi-user authentication**
  - User registration with bcrypt password hashing
  - Session-based login with secure token generation
  - In-memory session management

- **Real-time chat**
  - WebSocket-based messaging between clients and server
  - Message broadcasting to all authenticated users
  - Unique message IDs with parent-child relationship support

- **AI integration**
  - Direct MiniMax API integration (MiniMax-M2.7-highspeed model)
  - Anthropic-compatible API format
  - Message history tracking per session

- **Weather intelligence**
  - Automatic weather query detection
  - Live weather data from wttr.in
  - Contextual enrichment of weather-related questions
  - Support for major Chinese and English city names

- **HTTP bridge endpoint**
  - `POST /ai-response` for receiving external AI responses
  - Enables integration with external AI systems and agent bridges

- **Project infrastructure**
  - Complete documentation (README, SPEC, API, ARCHITECTURE, DEPLOYMENT)
  - MIT License
  - Contributing guidelines
  - Environment variable configuration (`.env`)

### Architecture

- **Server**: Node.js with built-in `http` and `ws` WebSocket library
- **Client**: Single-page application (HTML/CSS/JS)
- **AI Backend**: MiniMax API (Anthropic-compatible)
- **Weather Data**: wttr.in

### Known Limitations

- Message history is in-memory only (resets on restart)
- Single AI backend (MiniMax only)
- No persistent user data storage beyond password hashes
- Session attachment to OpenClaw gateway requires `operator.admin` scope (not available in standard deployments)

---

## [0.1.0] — 2026-03-25

### Added

- Initial project setup
- Basic WebSocket server skeleton
- OpenClaw gateway client integration (experimental)
- Proof-of-concept chat interface

---

## Future Considerations

- [ ] Persistent message history (SQLite/PostgreSQL)
- [ ] Multiple AI backend support (OpenAI, Anthropic, etc.)
- [ ] User avatars and profiles
- [ ] Message reactions and threading
- [ ] Multiple chat rooms/channels
- [ ] Admin panel for user management
- [ ] Docker Compose for easy deployment
- [ ] Automated tests
