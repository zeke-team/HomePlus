/**
 * @fileoverview Direct AI Chat Service - Calls MiniMax API directly
 * 
 * Bypasses OpenClaw Gateway for AI responses.
 * Uses MiniMax API (Anthropic-compatible) directly.
 * Conversation history is persisted to disk (JSON file).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// =============================================================================
// Configuration
// =============================================================================

// MiniMax
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_BASE_URL = process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/anthropic/v1';
const MINIMAX_MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M2.7-highspeed';

// DeepSeek
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

// Model -> provider routing
const MODEL_PROVIDER = {
  'MiniMax-M2.7-highspeed': 'minimax',
  'MiniMax-M2.7': 'minimax',
  'deepseek-chat': 'deepseek',
  'deepseek-reasoner': 'deepseek',
};

const DATA_DIR = process.env.DATA_DIR || './data';
const HISTORY_FILE = path.join(DATA_DIR, 'conversation-history.json');

// =============================================================================
// Logging
// =============================================================================

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const CURRENT_LEVEL = (process.env.LOG_LEVEL || 'info').toUpperCase();

function log(level, ...args) {
  const lvl = LOG_LEVELS.includes(level) ? level.toUpperCase() : 'INFO';
  if (LOG_LEVELS.indexOf(level) < LOG_LEVELS.indexOf(CURRENT_LEVEL)) return;
  console.log(`[${new Date().toISOString()}] [${lvl}] [chat]`, ...args);
}

// =============================================================================
// Conversation History Persistence
// =============================================================================

/**
 * Load history from disk
 */
function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      const parsed = JSON.parse(data);
      // Convert plain objects back to Map
      const map = new Map();
      for (const [key, value] of Object.entries(parsed)) {
        map.set(key, value);
      }
      log('info', `Loaded history: ${map.size} sessions`);
      return map;
    }
  } catch (err) {
    log('warn', `Failed to load history: ${err.message}`);
  }
  return new Map();
}

/**
 * Save history to disk
 */
function saveHistory() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    // Convert Map to plain object for JSON serialization
    const obj = Object.fromEntries(conversationHistory);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(obj, null, 2));
    log('debug', `Saved history: ${conversationHistory.size} sessions`);
  } catch (err) {
    log('error', `Failed to save history: ${err.message}`);
  }
}

// In-memory conversation history, loaded from disk on startup
const conversationHistory = loadHistory();

const SYSTEM_PROMPT = `You are a helpful AI assistant named 小E. You are part of the HomePlus multi-user chat application. Be friendly, concise, and helpful.`;

// Auto-save every 30 seconds if there are changes
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveHistory();
    saveTimer = null;
    if (conversationHistory.size > 0) scheduleSave();
  }, 30000);
}

// =============================================================================
// History Management
// =============================================================================

/**
 * Get or create conversation history for a session
 */
function getHistory(sessionKey) {
  if (!conversationHistory.has(sessionKey)) {
    conversationHistory.set(sessionKey, [
      { role: 'system', content: SYSTEM_PROMPT }
    ]);
    scheduleSave();
  }
  return conversationHistory.get(sessionKey);
}

/**
 * Clear conversation history for a session
 */
function clearHistory(sessionKey) {
  conversationHistory.delete(sessionKey);
  saveHistory();
  log('info', `Cleared history for session: ${sessionKey}`);
}

// =============================================================================
// AI Chat
// =============================================================================

/**
 * Send a message to the AI and get a response
 * @param {string} message - User message
 * @param {string} sessionKey - Session identifier
 * @param {string} [model] - Optional model override (defaults to MINIMAX_MODEL env var)
 * @returns {Promise<string>} - AI response text
 */
async function chat(message, sessionKey, model) {
  const history = getHistory(sessionKey);

  // Add user message to history
  history.push({ role: 'user', content: message });
  scheduleSave();

  // Resolve model: per-request override > default env var
  const resolvedModel = model || MINIMAX_MODEL;
  const provider = MODEL_PROVIDER[resolvedModel] || 'minimax';
  log('info', `Using model: ${resolvedModel} (provider: ${provider})`);

  let responseText;

  if (provider === 'deepseek') {
    responseText = await chatDeepSeek(history, resolvedModel);
  } else {
    responseText = await chatMiniMax(history, resolvedModel);
  }

  // Add assistant response to history
  history.push({ role: 'assistant', content: responseText });
  scheduleSave();

  // Keep history manageable (last 20 messages + system)
  if (history.length > 41) {
    history.splice(1, history.length - 41);
  }

  return responseText;
}

/**
 * Chat via MiniMax API (Anthropic-compatible)
 */
async function chatMiniMax(history, model) {
  if (!MINIMAX_API_KEY) {
    throw new Error('MINIMAX_API_KEY environment variable is not set');
  }

  try {
    const response = await fetch(`${MINIMAX_BASE_URL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: history.slice(1) // Skip system prompt in API call
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MiniMax API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Extract response text - skip 'thinking' blocks, get 'text' blocks
    const textBlocks = data.content?.filter(b => b.type === 'text') || [];
    return textBlocks.map(b => b.text).join('') || '抱歉，我没有收到有效的回复。';

  } catch (err) {
    log('error', `MiniMax error: ${err.message}`);
    throw err;
  }
}

/**
 * Chat via DeepSeek API (OpenAI-compatible)
 */
async function chatDeepSeek(history, model) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY environment variable is not set');
  }

  try {
    // DeepSeek uses OpenAI-compatible endpoint, messages use role:assistant not type:text
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: history.slice(1).map(h => ({
          role: h.role === 'system' ? 'system' : h.role,
          content: h.content
        }))
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '抱歉，我没有收到有效的回复。';

  } catch (err) {
    log('error', `DeepSeek error: ${err.message}`);
    throw err;
  }
}

// =============================================================================
// Module Export
// =============================================================================

module.exports = {
  chat,
  getHistory,
  clearHistory
};
