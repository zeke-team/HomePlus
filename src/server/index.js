/**
 * @fileoverview Main server entry point for HomePlus
 * 
 * Initializes and manages the HTTP and WebSocket servers,
 * handles client connections, authentication, and message routing.
 * 
 * @module server/index
 * @author HomePlus Team
 * @license MIT
 */

// Load environment variables first
require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

// Import shared protocol definitions
const {
  MessageTypes,
  Senders,
  ConnectionStatus,
  createMessage,
  createErrorMessage,
  createSuccessMessage,
  validateClientMessage,
  formatTime
} = require('../shared/protocol');

// Import server modules
const users = require('./users');
const sessionManager = require('./session-manager');
const openclaw = require('./openclaw-client');
const chatService = require('./chat-service');

// =============================================================================
// Configuration
// =============================================================================

const HTTP_PORT = parseInt(process.env.HOMEPLUS_HTTP_PORT || '18790', 10);
const WS_PORT = parseInt(process.env.HOMEPLUS_WS_PORT || '18791', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const STATIC_DIR = path.join(__dirname, '..', 'client');
const MAIN_SESSION = 'agent:main:main';
// Dedicated HomePlus session - created after connect
let HOMEPULS_SESSION_KEY = null;

// =============================================================================
// Server State
// =============================================================================

/** @type {http.Server} */
let httpServer = null;

/** @type {WebSocket.Server} */
let wsServer = null;

/** @type {boolean} */
let isShuttingDown = false;

// =============================================================================
// Logging
// =============================================================================

/**
 * Standardized logging function with timestamps
 * @param {string} level - Log level
 * @param {string} component - Component identifier
 * @param {string} message - Log message
 */
function log(level, component, message) {
  const timestamp = new Date().toISOString();
  const levels = ['debug', 'info', 'warn', 'error'];
  const logLevel = levels.includes(level) ? level.toUpperCase() : 'INFO';
  
  const currentLevel = (process.env.LOG_LEVEL || 'info').toUpperCase();
  if (levels.indexOf(level) < levels.indexOf(currentLevel)) {
    return;
  }
  
  console.log(`[${timestamp}] [${logLevel}] [${component}] ${message}`);
}

// =============================================================================
// HTTP Server - Static File Serving
// =============================================================================

/**
 * Serves static files from the client directory
 * 
 * @param {http.IncomingMessage} req - HTTP request
 * @param {http.ServerResponse} res - HTTP response
 */
function handleHttpRequest(req, res) {
  // Parse URL and normalize path
  let pathname = url.parse(req.url).pathname;
  
  // Handle /ai-response endpoint - receives AI responses from the agent
  // Used to bridge AI responses to HomePlus WebSocket clients
  if (pathname === '/ai-response' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { content, from, sessionKey } = payload;
        log('info', 'http', `AI response received from ${from}: ${String(content).substring(0, 50)}`);
        
        // Broadcast to all authenticated WebSocket clients
        const responseMsg = createMessage(MessageTypes.MESSAGE, {
          from: from || 'bot',
          content: content,
          timestamp: Date.now()
        });
        sessionManager.broadcastToAll(responseMsg);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        log('error', 'http', `AI response error: ${err.message}`);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  
  // Default to index.html for root
  if (pathname === '/') {
    pathname = '/index.html';
  }

  // Security: prevent directory traversal
  pathname = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  
  const filePath = path.join(STATIC_DIR, pathname);

  // Determine content type
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject'
  };

  const contentType = contentTypes[ext] || 'application/octet-stream';

  // Read and serve file
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // File not found
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>404 - Not Found</h1><p>The requested file was not found.</p></body></html>');
      } else {
        // Server error
        log('error', 'http', `Error reading file: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>500 - Server Error</h1></body></html>');
      }
      return;
    }

    // CORS headers for development
    if (NODE_ENV === 'development') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    // Cache static assets in production
    if (NODE_ENV === 'production') {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// =============================================================================
// WebSocket Server - Client Connections
// =============================================================================

/**
 * Initializes the WebSocket server
 */
function initWebSocketServer() {
  wsServer = new WebSocket.Server({ port: WS_PORT });

  wsServer.on('connection', handleWebSocketConnection);

  log('info', 'server', `WebSocket server listening on port ${WS_PORT}`);
}

/**
 * Handles new WebSocket client connections
 * 
 * @param {WebSocket} ws - WebSocket connection
 * @param {http.IncomingMessage} req - HTTP request
 */
function handleWebSocketConnection(ws, req) {
  const clientId = uuidv4();
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  log('info', 'server', `New client connection from ${clientIp} (${clientId})`);

  // Track authenticated state
  let isAuthenticated = false;
  let authenticatedUsername = null;

  // Send welcome message
  ws.send(JSON.stringify({
    type: MessageTypes.STATUS,
    status: ConnectionStatus.CONNECTING,
    message: 'Connecting to server...'
  }));

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      log('info', 'server', `Received from ${clientId}: ${JSON.stringify(message).substring(0, 100)}`);
      handleClientMessage(ws, message, clientId, clientIp, {
        get authenticated() { return isAuthenticated; },
        set authenticated(val) { isAuthenticated = val; },
        get username() { return authenticatedUsername; },
        set username(val) { authenticatedUsername = val; }
      });
    } catch (err) {
      log('error', 'server', `Invalid message from ${clientId}: ${err.message}`);
      ws.send(JSON.stringify(createErrorMessage('Invalid message format')));
    }
  });

  // Handle disconnection
  ws.on('close', (code, reason) => {
    log('info', 'server', `Client disconnected: ${clientId} (${code})`);
    
    if (authenticatedUsername) {
      sessionManager.removeSession(clientId);
    }
  });

  // Handle errors
  ws.on('error', (err) => {
    log('error', 'server', `WebSocket error for ${clientId}: ${err.message}`);
  });
}

/**
 * Processes incoming client messages
 * 
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Parsed message object
 * @param {string} clientId - Client identifier
 * @param {string} clientIp - Client IP address
 * @param {Object} authState - Authentication state object
 */
async function handleClientMessage(ws, message, clientId, clientIp, authState) {
  // Validate message structure
  const validation = validateClientMessage(message);
  if (!validation.valid) {
    ws.send(JSON.stringify(createErrorMessage(validation.error, message.id)));
    return;
  }

  // Update session activity
  sessionManager.touchSession(clientId);

  // Route message based on type
  switch (message.type) {
    case MessageTypes.LOGIN:
      await handleLogin(ws, message, clientId, clientIp, authState);
      break;

    case MessageTypes.REGISTER:
      await handleRegister(ws, message, clientId, authState);
      break;

    case MessageTypes.MESSAGE:
      await handleChatMessage(ws, message, clientId, authState);
      break;

    case MessageTypes.HISTORY:
      await handleHistoryRequest(ws, message, clientId, authState);
      break;

    case MessageTypes.PING:
      ws.send(JSON.stringify({ type: MessageTypes.PONG, timestamp: Date.now() }));
      break;

    case MessageTypes.LOGOUT:
      handleLogout(ws, clientId, authState);
      break;

    default:
      ws.send(JSON.stringify(createErrorMessage('Unknown message type', message.id)));
  }
}

/**
 * Handles user login
 * 
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Login message
 * @param {string} clientId - Client identifier
 * @param {string} clientIp - Client IP
 * @param {Object} authState - Auth state object
 */
async function handleLogin(ws, message, clientId, clientIp, authState) {
  log('info', 'server', `Login attempt for user: ${message.username}`);

  const result = await users.authenticateUser(message.username, message.password);

  if (!result.success) {
    ws.send(JSON.stringify({
      type: MessageTypes.AUTH_ERROR,
      message: result.message,
      success: false
    }));
    return;
  }

  // Mark as authenticated
  authState.authenticated = true;
  authState.username = result.user.username;

  // Create session
  const session = sessionManager.createSession(result.user.username, ws, {
    ip: clientIp
  });

  // Skip session.attach - it requires operator.admin scope
  // Instead, messages will be routed through the main session
  // The gateway will process chat.send even without attach

  // Send success response
  ws.send(JSON.stringify({
    type: MessageTypes.AUTH_SUCCESS,
    username: result.user.username,
    sessionKey: 'agent:main:main',  // We use main session, not per-user
    success: true,
    message: 'Login successful'
  }));

  // Request chat history from main session (all users share one conversation)
  openclaw.requestHistory('agent:main:main', 50);
}

/**
 * Handles user registration
 * 
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Register message
 * @param {string} clientId - Client identifier
 * @param {Object} authState - Auth state object
 */
async function handleRegister(ws, message, clientId, authState) {
  log('info', 'server', `Registration attempt for user: ${message.username}`);

  const result = await users.registerUser(message.username, message.password);

  if (!result.success) {
    ws.send(JSON.stringify({
      type: MessageTypes.AUTH_ERROR,
      message: result.message,
      success: false
    }));
    return;
  }

  // Auto-login after registration
  authState.authenticated = true;
  authState.username = message.username;

  // Create session (for tracking purposes only - we use main session for AI communication)
  const session = sessionManager.createSession(message.username, ws);

  // NOTE: session.attach intentionally skipped - we use agent:main:main for all AI communication
  // Per-user sessions require operator.admin scope

  // Send success response
  ws.send(JSON.stringify({
    type: MessageTypes.AUTH_SUCCESS,
    username: message.username,
    sessionKey: 'agent:main:main',  // We use main session, not per-user
    success: true,
    message: 'Registration successful'
  }));
}

/**
 * Handles chat messages
 * 
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Chat message
 * @param {string} clientId - Client identifier
 * @param {Object} authState - Auth state object
 */
async function handleChatMessage(ws, message, clientId, authState) {
  log('info', 'server', `handleChatMessage called. authenticated=${authState.authenticated}, username=${authState.username}`);
  
  // Require authentication
  if (!authState.authenticated) {
    ws.send(JSON.stringify(createErrorMessage('Not authenticated', message.id)));
    return;
  }

  const session = sessionManager.getSessionByWs(ws);
  log('info', 'server', `Session check (by ws): ${session ? session.sessionKey : 'undefined'}`);
  if (!session) {
    ws.send(JSON.stringify(createErrorMessage('Session not found', message.id)));
    return;
  }

  const msgId = message.id || uuidv4();

  // Echo user's message back to them immediately (pending response)
  ws.send(JSON.stringify({
    type: MessageTypes.MESSAGE,
    id: msgId,
    content: message.content,
    from: Senders.USER,
    timestamp: Date.now(),
    pending: true
  }));

  // Send message to AI via direct MiniMax API (with weather enrichment)
  try {
    const aiResponse = await chatService.chat(message.content, session.sessionKey);
    log('info', 'server', `AI response: ${aiResponse.substring(0, 80)}...`);
    
    // Send AI response back to user
    ws.send(JSON.stringify({
      type: MessageTypes.MESSAGE,
      id: uuidv4(),
      content: aiResponse,
      from: Senders.BOT,
      timestamp: Date.now(),
      parentId: msgId
    }));
  } catch (err) {
    log('error', 'server', `AI chat error: ${err.message}`);
    ws.send(JSON.stringify(createErrorMessage('AI服务暂时不可用，请稍后再试', msgId)));
  }
}

/**
 * Handles history request
 * 
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - History request message
 * @param {string} clientId - Client identifier
 * @param {Object} authState - Auth state object
 */
async function handleHistoryRequest(ws, message, clientId, authState) {
  // Require authentication
  if (!authState.authenticated) {
    ws.send(JSON.stringify(createErrorMessage('Not authenticated', message.id)));
    return;
  }

  // For now, return empty history (in-memory history maintained by chatService)
  ws.send(JSON.stringify({
    type: MessageTypes.HISTORY_RESPONSE,
    messages: [],
    id: message.id
  }));
}

/**
 * Handles logout
 * 
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} clientId - Client identifier
 * @param {Object} authState - Auth state object
 */
function handleLogout(ws, clientId, authState) {
  if (authState.authenticated) {
    log('info', 'server', `User logged out: ${authState.username}`);
    sessionManager.removeSession(clientId);
  }

  authState.authenticated = false;
  authState.username = null;

  ws.send(JSON.stringify({
    type: MessageTypes.STATUS,
    status: ConnectionStatus.DISCONNECTED,
    message: 'Logged out'
  }));

  ws.close(1000, 'Logged out');
}

// =============================================================================
// OpenClaw Gateway Events
// =============================================================================

/**
 * Sets up event handlers for OpenClaw Gateway connection
 */
function setupGatewayEvents() {
  openclaw.on('connected', (data) => {
    log('info', 'server', 'OpenClaw Gateway connected');
    
    // Create a dedicated HomePlus session for all chat
    openclaw.createSession(null, (err, result) => {
      if (err || !result?.sessionKey) {
        log('error', 'server', `Failed to create HomePlus session: ${err?.message || 'no sessionKey'}`);
        return;
      }
      HOMEPULS_SESSION_KEY = result.sessionKey;
      log('info', 'server', `HomePlus session created: ${HOMEPULS_SESSION_KEY}`);
      
      // Subscribe to the new session to receive AI responses
      openclaw.subscribeSession(HOMEPULS_SESSION_KEY, 'server');
    });
    
    // Broadcast to all connected clients
    sessionManager.broadcastToAll({
      type: MessageTypes.STATUS,
      status: ConnectionStatus.CONNECTED,
      message: 'Connected to AI service'
    });
  });

  openclaw.on('disconnected', () => {
    log('warn', 'server', 'OpenClaw Gateway disconnected');
    
    sessionManager.broadcastToAll({
      type: MessageTypes.STATUS,
      status: ConnectionStatus.DISCONNECTED,
      message: 'Disconnected from AI service'
    });
  });
}

// =============================================================================
// Server Lifecycle
// =============================================================================

/**
 * Starts all servers
 */
async function start() {
  log('info', 'server', '='.repeat(50));
  log('info', 'server', 'HomePlus Server Starting');
  log('info', 'server', '='.repeat(50));

  // Initialize user database
  try {
    await users.initialize();
  } catch (err) {
    log('error', 'server', `Failed to initialize user system: ${err.message}`);
    process.exit(1);
  }

  // Setup gateway events BEFORE connecting (so we catch the 'connected' event)
  setupGatewayEvents();

  // Connect to OpenClaw Gateway
  try {
    const connected = await openclaw.connect();
    if (connected) {
      log('info', 'server', 'Connected to OpenClaw Gateway');
      // Subscribe to main session after successful connection
      openclaw.subscribeSession('agent:main:main', 'server');
    } else {
      log('warn', 'server', 'Could not connect to OpenClaw Gateway - will retry');
    }
  } catch (err) {
    log('error', 'server', `Gateway connection error: ${err.message}`);
  }

  // Start HTTP server
  httpServer = http.createServer(handleHttpRequest);
  httpServer.listen(HTTP_PORT, () => {
    log('info', 'server', `HTTP server listening on port ${HTTP_PORT}`);
  });

  // Start WebSocket server
  initWebSocketServer();

  // Setup graceful shutdown
  setupShutdownHandlers();

  log('info', 'server', 'HomePlus Server Ready');
  log('info', 'server', `Environment: ${NODE_ENV}`);
}

/**
 * Sets up handlers for graceful shutdown
 */
function setupShutdownHandlers() {
  const shutdown = (signal) => {
    if (isShuttingDown) {
      log('warn', 'server', 'Shutdown already in progress');
      return;
    }
    
    isShuttingDown = true;
    log('info', 'server', `Received ${signal} - shutting down gracefully`);

    // Close WebSocket server
    if (wsServer) {
      wsServer.close(() => {
        log('info', 'server', 'WebSocket server closed');
      });
    }

    // Disconnect from gateway
    openclaw.disconnect();

    // Close HTTP server
    if (httpServer) {
      httpServer.close(() => {
        log('info', 'server', 'HTTP server closed');
        process.exit(0);
      });
    }

    // Force exit after 10 seconds
    setTimeout(() => {
      log('error', 'server', 'Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    log('error', 'server', `Uncaught exception: ${err.message}`);
    log('error', 'server', err.stack);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    log('error', 'server', `Unhandled rejection: ${reason}`);
  });
}

// =============================================================================
// Start Server
// =============================================================================

start();
