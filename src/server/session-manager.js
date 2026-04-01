/**
 * @fileoverview Session manager for HomePlus
 * 
 * Manages WebSocket client sessions, sessionKey generation, and
 * maps users to their active connections. Each user gets a unique
 * sessionKey in the format: homeplus:{username}
 * 
 * @module server/session-manager
 * @author HomePlus Team
 * @license MIT
 */

const { v4: uuidv4 } = require('uuid');

/**
 * @typedef {Object} ClientSession
 * @property {string} sessionKey - Unique session key (homeplus:{username})
 * @property {string} username - Associated username
 * @property {WebSocket} ws - WebSocket connection
 * @property {string} clientId - Unique client identifier
 * @property {number} connectedAt - Connection timestamp
 * @property {number} lastActivity - Last activity timestamp
 * @property {Object} metadata - Additional session metadata
 */

/**
 * Session store mapping clientId to ClientSession
 * @type {Map<string, ClientSession>}
 */
const sessions = new Map();

/**
 * WebSocket -> session mapping for direct lookup
 * @type {WeakMap<WebSocket, ClientSession>}
 */
const sessionsByWs = new WeakMap();

/**
 * Reverse index: username -> Set of clientIds
 * @type {Map<string, Set<string>>}
 */
const userSessions = new Map();

/**
 * Configuration
 */
const SESSION_EXPIRY_MS = parseInt(process.env.SESSION_EXPIRY || '86400000', 10); // 24 hours default

/**
 * Generates a unique session key for a user
 * Format: homeplus:{username}
 * 
 * @param {string} username - The username to generate session key for
 * @returns {string} Complete session key
 * 
 * @example
 * const sessionKey = generateSessionKey('john');
 * // Returns: 'homeplus:john'
 */
function generateSessionKey(username) {
  if (!username || typeof username !== 'string') {
    throw new Error('Username is required to generate session key');
  }
  
  // Sanitize username to prevent injection
  const sanitized = username.replace(/[^a-zA-Z0-9_-]/g, '');
  return `homeplus:${sanitized}`;
}

/**
 * Extracts username from a session key
 * 
 * @param {string} sessionKey - Session key (e.g., 'homeplus:john')
 * @returns {string|null} Username or null if invalid
 * 
 * @example
 * const username = extractUsername('homeplus:john');
 * // Returns: 'john'
 */
function extractUsername(sessionKey) {
  if (!sessionKey || typeof sessionKey !== 'string') {
    return null;
  }
  
  const prefix = 'homeplus:';
  if (!sessionKey.startsWith(prefix)) {
    return null;
  }
  
  return sessionKey.substring(prefix.length);
}

/**
 * Creates a new session for a connected client
 * 
 * @param {string} username - Username to associate with session
 * @param {WebSocket} ws - WebSocket connection object
 * @param {Object} [metadata={}] - Optional session metadata
 * @returns {ClientSession} Created session object
 * 
 * @example
 * const session = createSession('john', ws, { device: 'chrome' });
 * console.log(session.sessionKey); // 'homeplus:john'
 */
function createSession(username, ws, metadata = {}) {
  const clientId = uuidv4();
  const sessionKey = generateSessionKey(username);
  const now = Date.now();

  /** @type {ClientSession} */
  const session = {
    sessionKey,
    username,
    ws,
    clientId,
    connectedAt: now,
    lastActivity: now,
    metadata: {
      userAgent: metadata.userAgent || 'unknown',
      ip: metadata.ip || 'unknown',
      ...metadata
    }
  };

  // Store session by clientId
  sessions.set(clientId, session);

  // Also store by ws object for direct WebSocket lookup
  sessionsByWs.set(ws, session);

  // Update reverse index
  if (!userSessions.has(username)) {
    userSessions.set(username, new Set());
  }
  userSessions.get(username).add(clientId);

  log('info', `Session created: ${username} (${clientId})`);
  return session;
}

/**
 * Updates the last activity timestamp for a session
 * 
 * @param {string} clientId - Client session ID
 */
function touchSession(clientId) {
  const session = sessions.get(clientId);
  if (session) {
    session.lastActivity = Date.now();
  }
}

/**
 * Gets a session by client ID
 * 
 * @param {string} clientId - Client session ID
 * @returns {ClientSession|undefined} Session object or undefined
 */
function getSession(clientId) {
  return sessions.get(clientId);
}

/**
 * Gets a session directly by WebSocket object
 *
 * @param {WebSocket} ws - WebSocket connection
 * @returns {ClientSession|undefined} Session object or undefined
 */
function getSessionByWs(ws) {
  return sessionsByWs.get(ws);
}

/**
 * Gets a session by username
 * Returns the most recently active session for the user
 * 
 * @param {string} username - Username to look up
 * @returns {ClientSession|undefined} Most recent session or undefined
 */
function getSessionByUsername(username) {
  const clientIds = userSessions.get(username);
  if (!clientIds || clientIds.size === 0) {
    return undefined;
  }

  let mostRecent = undefined;
  let mostRecentTime = 0;

  for (const clientId of clientIds) {
    const session = sessions.get(clientId);
    if (session && session.lastActivity > mostRecentTime) {
      mostRecent = session;
      mostRecentTime = session.lastActivity;
    }
  }

  return mostRecent;
}

/**
 * Gets all active sessions for a user
 * 
 * @param {string} username - Username to look up
 * @returns {ClientSession[]} Array of active sessions
 */
function getUserSessions(username) {
  const clientIds = userSessions.get(username);
  if (!clientIds) {
    return [];
  }

  const result = [];
  for (const clientId of clientIds) {
    const session = sessions.get(clientId);
    if (session) {
      result.push(session);
    }
  }
  return result;
}

/**
 * Removes a session by client ID
 * 
 * @param {string} clientId - Client session ID to remove
 * @returns {boolean} True if session was found and removed
 */
function removeSession(clientId) {
  const session = sessions.get(clientId);
  if (!session) {
    return false;
  }

  // Remove from main store
  sessions.delete(clientId);

  // Remove from user index
  const userClientIds = userSessions.get(session.username);
  if (userClientIds) {
    userClientIds.delete(clientId);
    if (userClientIds.size === 0) {
      userSessions.delete(session.username);
    }
  }

  log('info', `Session removed: ${session.username} (${clientId})`);
  return true;
}

/**
 * Removes all sessions for a user (logout everywhere)
 * 
 * @param {string} username - Username whose sessions to remove
 * @returns {number} Number of sessions removed
 */
function removeUserSessions(username) {
  const clientIds = userSessions.get(username);
  if (!clientIds) {
    return 0;
  }

  let count = 0;
  for (const clientId of clientIds) {
    sessions.delete(clientId);
    count++;
  }

  userSessions.delete(username);
  log('info', `All sessions removed for user: ${username} (${count} sessions)`);
  return count;
}

/**
 * Gets all active sessions
 * 
 * @returns {ClientSession[]} Array of all active sessions
 */
function getAllSessions() {
  return Array.from(sessions.values());
}

/**
 * Gets count of active sessions
 * 
 * @returns {number} Number of active sessions
 */
function getSessionCount() {
  return sessions.size;
}

/**
 * Gets count of unique users with active sessions
 * 
 * @returns {number} Number of unique users
 */
function getUniqueUserCount() {
  return userSessions.size;
}

/**
 * Cleans up expired sessions
 * Runs periodically to remove stale sessions
 * 
 * @param {number} [maxIdleMs=SESSION_EXPIRY_MS] - Maximum idle time in ms
 * @returns {number} Number of sessions cleaned up
 */
function cleanupExpiredSessions(maxIdleMs = SESSION_EXPIRY_MS) {
  const now = Date.now();
  const toRemove = [];

  for (const [clientId, session] of sessions) {
    if (now - session.lastActivity > maxIdleMs) {
      toRemove.push(clientId);
    }
  }

  for (const clientId of toRemove) {
    // Close WebSocket if still open
    const session = sessions.get(clientId);
    if (session && session.ws && session.ws.readyState === 1) {
      try {
        session.ws.close(1001, 'Session expired');
      } catch (e) {
        // Ignore close errors
      }
    }
    removeSession(clientId);
  }

  if (toRemove.length > 0) {
    log('info', `Cleaned up ${toRemove.length} expired sessions`);
  }

  return toRemove.length;
}

/**
 * Broadcasts a message to all sessions of a specific user
 * 
 * @param {string} username - Target username
 * @param {Object} message - Message to send
 * @returns {number} Number of sessions message was sent to
 */
function broadcastToUser(username, message) {
  const userSessionsList = getUserSessions(username);
  let sent = 0;

  for (const session of userSessionsList) {
    if (session.ws && session.ws.readyState === 1) {
      try {
        session.ws.send(JSON.stringify(message));
        sent++;
      } catch (e) {
        log('error', `Failed to broadcast to ${session.clientId}: ${e.message}`);
      }
    }
  }

  return sent;
}

/**
 * Broadcasts a message to all connected sessions
 * 
 * @param {Object} message - Message to send
 * @returns {number} Number of sessions message was sent to
 */
function broadcastToAll(message) {
  let sent = 0;

  for (const session of sessions.values()) {
    if (session.ws && session.ws.readyState === 1) {
      try {
        session.ws.send(JSON.stringify(message));
        sent++;
      } catch (e) {
        log('error', `Failed to broadcast to ${session.clientId}: ${e.message}`);
      }
    }
  }

  return sent;
}

/**
 * Validates if a session key is properly formatted
 * 
 * @param {string} sessionKey - Session key to validate
 * @returns {boolean} True if valid format
 */
function isValidSessionKey(sessionKey) {
  if (!sessionKey || typeof sessionKey !== 'string') {
    return false;
  }
  
  const prefix = 'homeplus:';
  if (!sessionKey.startsWith(prefix)) {
    return false;
  }
  
  const username = sessionKey.substring(prefix.length);
  // Username should be 1-32 chars, alphanumeric with underscore/hyphen
  return /^[a-zA-Z0-9_-]{1,32}$/.test(username);
}

/**
 * Gets session statistics
 * 
 * @returns {Object} Statistics object
 */
function getStats() {
  return {
    totalSessions: sessions.size,
    uniqueUsers: userSessions.size,
    sessionsByUsername: Object.fromEntries(
      Array.from(userSessions.entries()).map(([username, clientIds]) => [username, clientIds.size])
    )
  };
}

/**
 * Standardized logging function with timestamps
 * 
 * @param {string} level - Log level (debug, info, warn, error)
 * @param {string} message - Log message
 */
function log(level, message) {
  const timestamp = new Date().toISOString();
  const levels = ['debug', 'info', 'warn', 'error'];
  const logLevel = levels.includes(level) ? level.toUpperCase() : 'INFO';
  
  const currentLevel = (process.env.LOG_LEVEL || 'info').toUpperCase();
  if (levels.indexOf(level) < levels.indexOf(currentLevel)) {
    return;
  }
  
  console.log(`[${timestamp}] [${logLevel}] [session] ${message}`);
}

// In-memory sessions are NOT persisted - they exist only for the lifetime of the server process
// TODO: consider persisting active sessions if needed for crash recovery
// For now, session data is lost on restart (acceptable for WebSocket sessions)

// Start periodic cleanup (every 5 minutes)
setInterval(() => {
  cleanupExpiredSessions();
}, 5 * 60 * 1000);

// Export all functions and utilities
module.exports = {
  // Session key operations
  generateSessionKey,
  extractUsername,
  isValidSessionKey,

  // Session CRUD
  createSession,
  getSession,
  getSessionByWs,
  getSessionByUsername,
  getUserSessions,
  removeSession,
  removeUserSessions,
  touchSession,

  // Query operations
  getAllSessions,
  getSessionCount,
  getUniqueUserCount,

  // Cleanup
  cleanupExpiredSessions,

  // Broadcast
  broadcastToUser,
  broadcastToAll,

  // Utilities
  getStats,
  log
};
