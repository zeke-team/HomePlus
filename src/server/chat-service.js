/**
 * @fileoverview Direct AI Chat Service - Calls MiniMax API directly
 * 
 * Bypasses OpenClaw Gateway for AI responses.
 * Uses MiniMax API (Anthropic-compatible) directly.
 * Includes pre-fetched tools for weather lookups (no gateway dependency).
 */

const crypto = require('crypto');

// MiniMax API configuration
const MINIMAX_API_KEY = 'sk-cp-9mdTjNUwzXFJwZr15iEZRP84nPA87hWTcz2O5tAzVkb2pJlnLcMbh9gpKdYyqiAofF5hhcWUivSdnrf1CuMy1O6Q89rLjfRJ7I8OG27Uz4_H159Q3AJPoGc';
const MINIMAX_BASE_URL = 'https://api.minimaxi.com/anthropic/v1';

// Simple in-memory conversation history per session
// In production, this should be persisted
const conversationHistory = new Map();

const SYSTEM_PROMPT = `You are a helpful AI assistant named 小E. You are part of the HomePlus multi-user chat application. Be friendly, concise, and helpful. When responding to HomePlus users, you should be warm and welcoming.`;

/**
 * Fetch weather data using wttr.in (no API key needed)
 * @param {string} location - City name (e.g., "Beijing", "北京")
 * @returns {Promise<string>} - Weather summary string
 */
async function fetchWeather(location) {
  try {
    // Map Chinese city names to English
    const cityMap = {
      '北京': 'Beijing', '上海': 'Shanghai', '广州': 'Guangzhou',
      '深圳': 'Shenzhen', '香港': 'Hong+Kong', '澳门': 'Macau',
      '东京': 'Tokyo', '纽约': 'New+York', '伦敦': 'London',
      '巴黎': 'Paris', '新加坡': 'Singapore', '台北': 'Taipei'
    };
    const city = cityMap[location] || location;
    
    const response = await fetch(`https://wttr.in/${city}?format=%l:+%c+%t+(feels+like+%f),+wind+%w,+humidity+%h,+precipitation+%p`);
    if (!response.ok) throw new Error('Weather fetch failed');
    return await response.text();
  } catch (err) {
    return `天气数据暂时无法获取 (${err.message})`;
  }
}

/**
 * Check if message is asking about weather
 */
function isWeatherQuery(message) {
  const weatherKeywords = ['天气', 'weather', '温度', 'temperature', '下雨', 'rain', '气候', 'climate'];
  const lower = message.toLowerCase();
  return weatherKeywords.some(k => lower.includes(k));
}

/**
 * Extract location from weather query
 */
function extractLocation(message) {
  // Simple pattern: after "北京天气", "weather in Shanghai", etc.
  const patterns = [
    /(?:天气|weather|温度).*(?:在|in|of)\s*(\S+)/i,
    /(\S+)\s*(?:天气|weather)/i,
    /(?:在|in)\s*(\S+)\s*(?:天气|weather)/i
  ];
  for (const p of patterns) {
    const m = message.match(p);
    if (m) return m[1];
  }
  // Default to Beijing
  return 'Beijing';
}

/**
 * Get or create conversation history for a session
 */
function getHistory(sessionKey) {
  if (!conversationHistory.has(sessionKey)) {
    conversationHistory.set(sessionKey, [
      {
        role: 'system',
        content: SYSTEM_PROMPT
      }
    ]);
  }
  return conversationHistory.get(sessionKey);
}

/**
 * Clear conversation history for a session
 */
function clearHistory(sessionKey) {
  conversationHistory.delete(sessionKey);
}

/**
 * Send a message to the AI and get a response
 * @param {string} message - User message
 * @param {string} sessionKey - Session identifier
 * @returns {Promise<string>} - AI response text
 */
async function chat(message, sessionKey) {
  const history = getHistory(sessionKey);
  
  // If weather query, prepend live weather data
  let enrichedMessage = message;
  if (isWeatherQuery(message)) {
    const location = extractLocation(message);
    const weatherData = await fetchWeather(location);
    enrichedMessage = `[用户询问天气] 地点: ${location}\n当前天气: ${weatherData}\n\n用户问题: ${message}\n\n请根据以上天气数据回答用户的问题。`;
    console.log('Weather enriched:', enrichedMessage.substring(0, 100));
  }
  
  // Add user message to history
  history.push({
    role: 'user',
    content: enrichedMessage
  });

  try {
    const response = await fetch(`${MINIMAX_BASE_URL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.7-highspeed',
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
    const responseText = textBlocks.map(b => b.text).join('') || '抱歉，我没有收到有效的回复。';
    
    // Add assistant response to history
    history.push({
      role: 'assistant',
      content: responseText
    });

    // Keep history manageable (last 20 messages + system)
    if (history.length > 41) {
      history.splice(1, history.length - 41);
    }

    return responseText;
  } catch (err) {
    console.error('Chat service error:', err.message);
    throw err;
  }
}

module.exports = {
  chat,
  getHistory,
  clearHistory
};
