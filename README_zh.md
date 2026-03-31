# HomePlus

一款基于 OpenClaw ACP 协议的自托管多用户 AI 聊天应用。HomePlus 支持多个用户通过现代 Web 界面与 AI 助手即时对话，采用 WebSocket 实现实时消息传递。

[English](README.md) · [中文](README_zh.md)

---

## ✨ 功能特性

- **多用户聊天** — 多用户同时加入聊天，各自独立会话
- **实时消息** — 基于 WebSocket 的即时消息传递
- **AI 驱动** — 直连 MiniMax API，响应速度快
- **天气智能查询** — 内置天气查询，实时数据来自 wttr.in
- **自托管部署** — 完全运行在自有基础设施上
- **OpenClaw 集成** — 可与 OpenClaw gateway 生态配合使用

---

## 🚀 快速开始

### 环境要求

- Node.js 18+（推荐 Node 22）
- npm 9+

### 安装

```bash
# 克隆仓库
git clone https://github.com/yourusername/homeplus.git
cd homeplus

# 安装依赖
npm install

# 复制环境变量模板并配置
cp .env.example .env
# 编辑 .env 填写配置

# 启动服务
npm start
```

### 配置

编辑 `.env`（参考 `.env.example`）：

```env
PORT=18790
WS_PORT=18791
MINIMAX_API_KEY=your_api_key_here
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic/v1
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=your_gateway_token
```

### 生产环境运行

```bash
npm run build   # 构建生产版本
npm start        # 启动生产服务器
```

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────┐
│                    HomePlus                          │
├─────────────────────────────────────────────────────┤
│  HTTP Server (Port 18790)                           │
│  ├── 静态文件 (Web UI)                              │
│  └── REST API (/ai-response)                        │
├─────────────────────────────────────────────────────┤
│  WebSocket Server (Port 18791)                      │
│  ├── 身份认证 (用户登录)                             │
│  ├── 消息广播                                       │
│  └── 会话管理                                       │
├─────────────────────────────────────────────────────┤
│  聊天服务层                                          │
│  ├── ChatService (直连 MiniMax API)                │
│  └── WeatherService (wttr.in 集成)                  │
└─────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────┐
│              MiniMax API (外部服务)                   │
└─────────────────────────────────────────────────────┘
```

### 核心组件

| 组件 | 说明 |
|------|------|
| `src/server/index.js` | 主 HTTP + WebSocket 服务器 |
| `src/server/chat-service.js` | 直连 AI API |
| `src/server/openclaw-client.js` | OpenClaw Gateway 客户端 |
| `src/server/session-manager.js` | WebSocket 会话管理 |
| `src/server/user-manager.js` | 用户认证 |
| `src/client/` | 前端 Web UI |

---

## 📖 文档

- [项目规格说明](SPEC.md) — 详细项目规格
- [架构文档](docs/ARCHITECTURE.md) — 系统架构详解
- [API 参考](docs/API.md) — HTTP/WebSocket API 文档
- [部署指南](docs/DEPLOYMENT.md) — 生产环境部署说明
- [更新日志](docs/CHANGELOG.md) — 版本历史

---

## 🌐 相关项目

HomePlus 旨在与 [OpenClaw](https://github.com/openclaw/openclaw) 生态配合使用。可独立运行，也可与现有 OpenClaw gateway 配合部署。

---

## 📄 许可证

MIT 许可证 — 详见 [LICENSE](LICENSE)。

---

## 🙏 致谢

基于 OpenClaw ACP 协议构建，由 MiniMax API 驱动。
