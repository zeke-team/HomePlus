/**
 * @fileoverview OpenClaw Gateway WebSocket client for HomePlus
 * 
 * Implements the OpenClaw Gateway protocol v3 for connecting as an operator.
 * Ref: https://docs.openclaw.ai/gateway/protocol
 * 
 * @module server/openclaw-client
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Import shared protocol definitions
const {
  MessageTypes,
  Senders,
  ConnectionStatus
} = require('../shared/protocol');

// Import session manager
const sessionManager = require('./session-manager');

/**
 * OpenClaw Gateway client instance
 */
const client = {
  ws: null,
  status: ConnectionStatus.DISCONNECTED,
  gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18792',
  gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN || 'homeplus-local-token',
  pendingRequests: new Map(),
  reconnectConfig: {
    enabled: true,
    maxRetries: Infinity,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    currentRetry: 0,
    reconnecting: false
  },
  messageHandlers: new Map(),
  pingInterval: null,
  nonce: null, // Challenge nonce from gateway
};

/**
 * Simple logging function
 */
function log(level, message) {
  const timestamp = new Date().toISOString();
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
  console.log(`[${timestamp}] ${prefix} [gateway] ${message}`);
}

/**
 * Connects to the OpenClaw Gateway
 */
async function connect() {
  if (client.ws && client.ws.readyState === WebSocket.OPEN) {
    log('info', 'Already connected');
    return true;
  }

  log('info', `Connecting to ${client.gatewayUrl}`);

  return new Promise((resolve) => {
    client.status = ConnectionStatus.CONNECTING;

    try {
      // Build URL with token as query parameter
      const url = new URL(client.gatewayUrl);
      if (client.gatewayToken) {
        url.searchParams.set('token', client.gatewayToken);
      }

      client.ws = new WebSocket(url.toString(), {
        handshakeTimeout: 15000
      });

      client.ws.on('open', () => handleOpen());
      client.ws.on('message', (data) => handleMessage(data));
      client.ws.on('close', (code, reason) => handleClose(code, reason));
      client.ws.on('error', (err) => handleError(err));
      client.ws.on('pong', () => {});

      // Store resolve for later use after handshake completes
      client._pendingResolve = resolve;

      // Connection timeout
      setTimeout(() => {
        if (client.status === ConnectionStatus.CONNECTING) {
          log('error', 'Connection timeout');
          client.ws?.terminate();
          client.status = ConnectionStatus.ERROR;
          resolve(false);
        }
      }, 15000);

    } catch (err) {
      log('error', `WebSocket error: ${err.message}`);
      client.status = ConnectionStatus.ERROR;
      resolve(false);
    }
  });
}

/**
 * Handles WebSocket open - waits for challenge before sending connect
 */
function handleOpen() {
  log('info', 'WebSocket connected, waiting for challenge...');
  // Don't resolve yet - we need to complete the handshake first
}

/**
 * Handles incoming messages
 */
function handleMessage(data) {
  try {
    const message = JSON.parse(data.toString());
    log('debug', `Received: ${JSON.stringify(message).substring(0, 150)}`);

    switch (message.type) {
      case 'event':
        if (message.event === 'connect.challenge') {
          handleChallenge(message.payload);
        } else if (message.event === 'chat') {
          handleChatEvent(message.payload);
        } else if (message.event === 'agent') {
          // Agent events - could be streaming, ignore for now
          log('debug', `Agent event: ${message.payload?.stream}`);
        } else {
          log('debug', `Event: ${message.event}`);
        }
        break;

      case 'res':
        handleResponse(message);
        break;

      case 'session_message':
        handleSessionMessage(message);
        break;

      default:
        log('debug', `Unknown message type: ${message.type}`);
    }
  } catch (err) {
    log('error', `Parse error: ${err.message}`);
  }
}

/**
 * Handles connect.challenge from gateway
 * All connections must sign the server-provided nonce
 */
function handleChallenge(payload) {
  client.nonce = payload.nonce;
  log('info', `Got challenge, nonce: ${client.nonce.substring(0, 8)}...`);

  // Sign the nonce with HMAC-SHA256 using token
  const hmac = crypto.createHmac('sha256', client.gatewayToken);
  hmac.update(client.nonce);
  const signature = hmac.digest('hex');

  // Build the connect request per protocol v3
  const requestId = uuidv4();
  
  const connectRequest = {
    type: 'req',
    id: requestId,
    method: 'connect',
    params: {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: 'cli',
        version: '1.2.3',
        platform: 'linux',
        mode: 'node'
      },
      role: 'operator',
      scopes: ['operator.admin', 'operator.read', 'operator.write', 'operator.approvals', 'operator.pairing'],
      caps: [],
      commands: [],
      permissions: {},
      auth: {
        token: client.gatewayToken
      },
      locale: 'zh-CN',
      userAgent: 'HomePlus/1.0.0'
    }
  };

  client.ws.send(JSON.stringify(connectRequest));
  log('info', 'Sent connect request with signed challenge');
}

/**
 * Handles connect response
 */
function handleResponse(message) {
  // Check if this is the connect response
  if (message.payload?.type === 'hello-ok') {
    log('info', 'Connect successful - hello-ok received');
    client.status = ConnectionStatus.CONNECTED;
    startPingInterval();
    
    if (client._pendingResolve) {
      client._pendingResolve(true);
      client._pendingResolve = null;
    }
    
    const handlers = client.messageHandlers.get('connected');
    if (handlers) handlers.forEach(h => h({ success: true }));
    return;
  }
  
  // Handle other responses
  if (message.id && client.pendingRequests.has(message.id)) {
    const pending = client.pendingRequests.get(message.id);
    client.pendingRequests.delete(message.id);
    
    if (!message.ok) {
      log('error', `Request failed: ${JSON.stringify(message.error || message.payload)}`);
      if (pending.callback) pending.callback(new Error('Request failed'));
      else if (pending.reject) pending.reject(new Error('Request failed'));
    } else {
      log('info', `Request succeeded`);
      // Emit session.created event if this was a sessions.create response
      if (message.payload?.sessionKey) {
        const handlers = client.messageHandlers.get('session.created');
        if (handlers) handlers.forEach(h => h({ sessionKey: message.payload.sessionKey }));
      }
      if (pending.callback) pending.callback(null, message.payload);
      else if (pending.resolve) pending.resolve(message.payload);
    }
  }
}

/**
 * Handles session messages from gateway (AI responses)
 */
function handleSessionMessage(message) {
  const { sessionKey, content, messageId, timestamp } = message;

  log('debug', `Session message from ${sessionKey}: ${content?.substring(0, 100)}`);

  // Build outbound message
  const outboundMessage = {
    type: MessageTypes.MESSAGE,
    id: messageId || uuidv4(),
    content: content,
    from: Senders.BOT,
    timestamp: timestamp || Date.now()
  };

  // For agent:main:main (main session), broadcast to ALL logged-in users
  // since all HomePlus users share this session
  if (sessionKey === 'agent:main:main') {
    const allSessions = sessionManager.getAllSessions();
    log('info', `Broadcasting bot response to ${allSessions.length} users`);
    for (const session of allSessions) {
      try {
        session.ws.send(JSON.stringify(outboundMessage));
      } catch (err) {
        log('error', `Failed to broadcast: ${err.message}`);
      }
    }
    return;
  }

  // For user-specific sessions (homeplus:{username}), route to specific user
  const username = sessionKey.replace('homeplus:', '');
  const session = sessionManager.getSessionByUsername(username);
  if (!session) {
    log('warn', `No active session for user: ${username}`);
    return;
  }

  try {
    session.ws.send(JSON.stringify(outboundMessage));
    log('debug', `Relayed bot message to ${username}`);
  } catch (err) {
    log('error', `Failed to relay: ${err.message}`);
  }
}

/**
 * Handles chat events from gateway (AI response events)
 * These come as separate events during streaming, and final message in state=final
 */
function handleChatEvent(payload) {
  const { sessionKey, message, state, runId } = payload;

  log('info', `Chat event [${sessionKey}]: payload keys = ${Object.keys(payload).join(',')}`);

  // Extract text content - message can be a string or an object
  let textContent = '';
  if (typeof message === 'string') {
    textContent = message;
  } else if (message && typeof message === 'object') {
    // OpenClaw message format: { role, content: [{ type: "text", text: "..." }] }
    if (Array.isArray(message.content)) {
      // Extract from content array
      textContent = message.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('');
    } else if (message.text) {
      textContent = message.text;
    } else if (message.content) {
      textContent = String(message.content);
    } else {
      textContent = JSON.stringify(message);
    }
  }
  
  // Also check if message is directly in payload as 'message' field (simpler format)
  if (!textContent && payload.message && typeof payload.message === 'string') {
    textContent = payload.message;
  }
  
  log('info', `Extracted text: "${textContent.substring(0, 100)}"`);

  // Only handle final messages
  if (state !== 'final') {
    // For streaming, we could broadcast partial responses, but for now just log
    log('debug', `Chat streaming [${sessionKey}]: ${textContent?.substring(0, 50)}...`);
    return;
  }

  log('info', `Chat final [${sessionKey}]: ${textContent?.substring(0, 100)}`);

  // Build outbound message
  const outboundMessage = {
    type: MessageTypes.MESSAGE,
    id: runId || uuidv4(),
    content: textContent || '',
    from: Senders.BOT,
    timestamp: Date.now()
  };

  // Broadcast to ALL logged-in users
  const allSessions = sessionManager.getAllSessions();
  log('info', `Broadcasting chat event to ${allSessions.length} users`);
  for (const session of allSessions) {
    try {
      session.ws.send(JSON.stringify(outboundMessage));
    } catch (err) {
      log('error', `Failed to broadcast: ${err.message}`);
    }
  }
}

/**
 * Handles WebSocket close
 */
function handleClose(code, reason) {
  log('info', `Connection closed: ${code} ${reason}`);
  client.status = ConnectionStatus.DISCONNECTED;
  stopPingInterval();

  if (client._pendingResolve) {
    client._pendingResolve(false);
    client._pendingResolve = null;
  }
  
  // Reconnect if not intentional close
  if (code !== 1000 && client.reconnectConfig.enabled) {
    scheduleReconnect();
  }
}

/**
 * Handles WebSocket errors
 */
function handleError(err) {
  log('error', `WebSocket error: ${err.message}`);
  client.status = ConnectionStatus.ERROR;
}

/**
 * Starts ping interval for keepalive
 */
function startPingInterval() {
  stopPingInterval();
  client.pingInterval = setInterval(() => {
    if (client.ws && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.ping();
      } catch (err) {
        log('error', `Ping failed: ${err.message}`);
      }
    }
  }, 30000);
}

/**
 * Stops ping interval
 */
function stopPingInterval() {
  if (client.pingInterval) {
    clearInterval(client.pingInterval);
    client.pingInterval = null;
  }
}

/**
 * Schedules reconnection with exponential backoff
 */
function scheduleReconnect() {
  if (client.reconnectConfig.reconnecting) return;
  
  const { maxRetries, baseDelayMs, maxDelayMs, currentRetry } = client.reconnectConfig;
  if (currentRetry >= maxRetries) {
    log('error', 'Max retries reached');
    return;
  }

  client.reconnectConfig.reconnecting = true;
  const delay = Math.min(baseDelayMs * Math.pow(2, currentRetry), maxDelayMs);
  
  log('info', `Reconnecting in ${delay}ms (attempt ${currentRetry + 1})`);

  setTimeout(async () => {
    client.reconnectConfig.currentRetry++;
    client.reconnectConfig.reconnecting = false;
    
    const success = await connect();
    if (success) {
      client.reconnectConfig.currentRetry = 0;
    } else {
      scheduleReconnect();
    }
  }, delay);
}

/**
 * Sends a message through the gateway
 */
function sendMessage(sessionKey, content, messageId = null) {
  const msgId = messageId || uuidv4();

  const message = {
    type: 'req',
    id: uuidv4(),
    method: 'chat.send',
    params: {
      sessionKey,
      message: content,
      messageId: msgId
    }
  };

  if (!client.ws || client.ws.readyState !== WebSocket.OPEN) {
    log('warn', 'Not connected to gateway');
    return false;
  }

  try {
    client.ws.send(JSON.stringify(message));
    return true;
  } catch (err) {
    log('error', `Send failed: ${err.message}`);
    return false;
  }
}

/**
 * Subscribes to a session to receive messages for that session
 * Uses sessions.subscribe API (needs operator.read scope, not operator.admin)
 * 
 * @param {string} sessionKey - The session key to subscribe to
 * @param {string} clientId - The client ID making the request
 */
function subscribeSession(sessionKey, clientId) {
  const requestId = uuidv4();
  
  client.pendingRequests.set(requestId, { clientId });

  const message = {
    type: 'req',
    id: requestId,
    method: 'sessions.subscribe',
    params: {
      sessionKey
    }
  };

  try {
    client.ws.send(JSON.stringify(message));
    log('info', `Session subscribe requested: ${sessionKey}`);
    return true;
  } catch (err) {
    log('error', `Subscribe session failed: ${err.message}`);
    return false;
  }
}

/**
 * Unsubscribes from a session
 */
function unsubscribeSession(sessionKey) {
  const requestId = uuidv4();

  const message = {
    type: 'req',
    id: requestId,
    method: 'sessions.unsubscribe',
    params: {
      sessionKey
    }
  };

  try {
    client.ws.send(JSON.stringify(message));
    log('info', `Session unsubscribe requested: ${sessionKey}`);
    return true;
  } catch (err) {
    log('error', `Unsubscribe session failed: ${err.message}`);
    return false;
  }
}

/**
 * Requests chat history for a session
 */
function requestHistory(sessionKey, clientId, limit = 50) {
  const requestId = uuidv4();
  
  client.pendingRequests.set(requestId, { clientId });

  const message = {
    type: 'req',
    id: requestId,
    method: 'chat.history',
    params: {
      sessionKey,
      limit
    }
  };

  try {
    client.ws.send(JSON.stringify(message));
    return true;
  } catch (err) {
    log('error', `History request failed: ${err.message}`);
    return false;
  }
}

/**
 * Creates a new session
 * @param {string} [model] - Optional model ID
 * @param {function} callback - Callback with (error, sessionKey)
 */
function createSession(model, callback) {
  const requestId = uuidv4();
  
  const params = {};
  if (model) params.model = model;
  
  const message = {
    type: 'req',
    id: requestId,
    method: 'sessions.create',
    params
  };

  client.pendingRequests.set(requestId, { callback });

  try {
    client.ws.send(JSON.stringify(message));
    log('info', `Session create requested`);
    return true;
  } catch (err) {
    log('error', `Session create failed: ${err.message}`);
    callback(err);
    return false;
  }
}

/**
 * Registers a message handler
 */
function on(event, handler) {
  if (!client.messageHandlers.has(event)) {
    client.messageHandlers.set(event, new Set());
  }
  client.messageHandlers.get(event).add(handler);
}

/**
 * Disconnects from gateway
 */
function disconnect() {
  client.reconnectConfig.enabled = false;
  stopPingInterval();
  if (client.ws) {
    client.ws.close(1000, 'HomePlus shutdown');
    client.ws = null;
  }
  client.status = ConnectionStatus.DISCONNECTED;
  log('info', 'Disconnected');
}

/**
 * Gets current status
 */
function getStatus() {
  return client.status;
}

/**
 * Gets connection stats
 */
function getStats() {
  return {
    status: client.status,
    gatewayUrl: client.gatewayUrl,
    pendingRequests: client.pendingRequests.size,
    retryCount: client.reconnectConfig.currentRetry
  };
}

module.exports = {
  connect,
  disconnect,
  getStatus,
  getStats,
  sendMessage,
  subscribeSession,
  unsubscribeSession,
  createSession,
  requestHistory,
  on,
};
