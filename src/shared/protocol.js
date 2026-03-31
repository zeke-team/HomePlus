/**
 * @fileoverview Shared protocol definitions for HomePlus messaging
 * 
 * This module defines the message formats used for communication between
 * HomePlus clients and server, as well as the OpenClaw Gateway protocol.
 * 
 * @module shared/protocol
 * @author HomePlus Team
 * @license MIT
 */

/**
 * @typedef {Object} Message
 * @property {string} type - Message type identifier
 * @property {string} [id] - Unique message ID (UUID)
 * @property {string} [content] - Message content/text
 * @property {string} [from] - Message sender ('user', 'bot', 'system')
 * @property {number} [timestamp] - Unix timestamp in milliseconds
 */

/**
 * @typedef {Object} ClientMessage
 * @property {string} type - Message type (message, history, ping, login, register)
 * @property {string} [content] - Message content for type='message'
 * @property {string} [username] - Username for login/register
 * @property {string} [password] - Password for login/register
 * @property {number} [limit] - History limit for type='history'
 */

/**
 * @typedef {Object} ServerMessage
 * @property {string} type - Message type
 * @property {string} [content] - Message content
 * @property {string} [id] - Message ID
 * @property {string} [from] - Sender identifier
 * @property {number} [timestamp] - Unix timestamp
 * @property {string} [message] - Error or status message
 * @property {Message[]} [messages] - Array of messages for history response
 * @property {string} [sessionKey] - User's session key
 * @property {boolean} [success] - Operation success status
 */

/**
 * Message types enum
 * @readonly
 * @enum {string}
 */
const MessageTypes = {
  // Client to Server
  LOGIN: 'login',
  REGISTER: 'register',
  MESSAGE: 'message',
  HISTORY: 'history',
  PING: 'ping',
  LOGOUT: 'logout',

  // Server to Client
  AUTH_SUCCESS: 'auth_success',
  AUTH_ERROR: 'auth_error',
  MESSAGE: 'message',
  HISTORY: 'history',
  PONG: 'pong',
  ERROR: 'error',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  STATUS: 'status'
};

/**
 * OpenClaw Gateway message types
 * @readonly
 * @enum {string}
 */
const GatewayMessageTypes = {
  // Connection
  HANDSHAKE: 'handshake',
  SESSION_ATTACH: 'session_attach',
  
  // Messaging
  SESSION_MESSAGE: 'session_message',
  
  // History
  SESSION_HISTORY: 'session_history',
  SESSION_HISTORY_RESPONSE: 'session_history_response'
};

/**
 * Sender types for messages
 * @readonly
 * @enum {string}
 */
const Senders = {
  USER: 'user',
  BOT: 'bot',
  SYSTEM: 'system'
};

/**
 * Connection status types
 * @readonly
 * @enum {string}
 */
const ConnectionStatus = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error'
};

/**
 * Creates a standardized message object
 * 
 * @param {string} type - Message type
 * @param {Object} data - Additional message data
 * @returns {Object} Formatted message object
 * 
 * @example
 * const msg = createMessage(MessageTypes.MESSAGE, {
 *   id: 'uuid-123',
 *   content: 'Hello world',
 *   from: Senders.USER,
 *   timestamp: Date.now()
 * });
 */
function createMessage(type, data = {}) {
  return {
    type,
    id: data.id || generateId(),
    content: data.content || '',
    from: data.from || Senders.SYSTEM,
    timestamp: data.timestamp || Date.now(),
    ...data
  };
}

/**
 * Creates an error message
 * 
 * @param {string} errorMessage - Error description
 * @param {string} [id] - Related message ID if applicable
 * @returns {Object} Error message object
 */
function createErrorMessage(errorMessage, id = null) {
  return {
    type: MessageTypes.ERROR,
    id: id || generateId(),
    message: errorMessage,
    timestamp: Date.now()
  };
}

/**
 * Creates a success response message
 * 
 * @param {string} type - Response type
 * @param {Object} data - Success data to include
 * @returns {Object} Success message object
 */
function createSuccessMessage(type, data = {}) {
  return {
    type,
    success: true,
    timestamp: Date.now(),
    ...data
  };
}

/**
 * Generates a unique ID using crypto.randomUUID or fallback
 * 
 * @returns {string} Unique identifier string
 */
function generateId() {
  // Use crypto.randomUUID if available (Node.js 14.17+)
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Validates a client message structure
 * 
 * @param {Object} msg - Message to validate
 * @returns {{valid: boolean, error: string|null}} Validation result
 */
function validateClientMessage(msg) {
  if (!msg || typeof msg !== 'object') {
    return { valid: false, error: 'Invalid message format' };
  }

  if (!msg.type || typeof msg.type !== 'string') {
    return { valid: false, error: 'Message type is required' };
  }

  const validTypes = Object.values(MessageTypes);
  if (!validTypes.includes(msg.type)) {
    return { valid: false, error: `Invalid message type: ${msg.type}` };
  }

  // Type-specific validation
  switch (msg.type) {
    case MessageTypes.MESSAGE:
      if (typeof msg.content !== 'string' || msg.content.trim().length === 0) {
        return { valid: false, error: 'Message content is required' };
      }
      if (msg.content.length > 10000) {
        return { valid: false, error: 'Message content exceeds maximum length' };
      }
      break;

    case MessageTypes.LOGIN:
    case MessageTypes.REGISTER:
      if (typeof msg.username !== 'string' || msg.username.trim().length < 3) {
        return { valid: false, error: 'Username must be at least 3 characters' };
      }
      if (typeof msg.username !== 'string' || msg.username.length > 32) {
        return { valid: false, error: 'Username must be at most 32 characters' };
      }
      if (typeof msg.password !== 'string' || msg.password.length < 6) {
        return { valid: false, error: 'Password must be at least 6 characters' };
      }
      break;

    case MessageTypes.HISTORY:
      if (msg.limit !== undefined && (typeof msg.limit !== 'number' || msg.limit < 1 || msg.limit > 1000)) {
        return { valid: false, error: 'History limit must be between 1 and 1000' };
      }
      break;
  }

  return { valid: true, error: null };
}

/**
 * Formats a timestamp for display
 * 
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted time string (HH:mm:ss)
 */
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Formats a timestamp for display with date
 * 
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted datetime string
 */
function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Export all definitions and utilities
module.exports = {
  // Enums
  MessageTypes,
  GatewayMessageTypes,
  Senders,
  ConnectionStatus,

  // Factory functions
  createMessage,
  createErrorMessage,
  createSuccessMessage,
  generateId,

  // Validation
  validateClientMessage,

  // Formatting
  formatTime,
  formatDateTime
};
