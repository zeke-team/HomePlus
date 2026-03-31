/**
 * @fileoverview User management module for HomePlus
 * 
 * Handles user registration, authentication, and data persistence.
 * Uses bcrypt for secure password hashing and JSON file storage.
 * 
 * @module server/users
 * @author HomePlus Team
 * @license MIT
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

// Configuration constants
const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
const DATA_DIR = process.env.DATA_DIR || './data';
const USERS_FILE = path.join(DATA_DIR, 'users.json');

/**
 * @typedef {Object} User
 * @property {string} username - Unique username
 * @property {string} passwordHash - Bcrypt hashed password
 * @property {number} createdAt - Account creation timestamp
 * @property {number} lastLogin - Last login timestamp
 * @property {Object} metadata - Additional user metadata
 */

/**
 * @typedef {Object} UserStore
 * @property {number} version - Data format version
 * @property {number} lastUpdated - Last modification timestamp
 * @property {Object.<string, User>} users - Users by username
 */

/**
 * Ensures the data directory exists
 * @returns {Promise<void>}
 */
async function ensureDataDirectory() {
  return new Promise((resolve, reject) => {
    fs.mkdir(DATA_DIR, { recursive: true }, (err) => {
      if (err && err.code !== 'EEXIST') {
        reject(new Error(`Failed to create data directory: ${err.message}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Reads the users database from disk
 * @returns {Promise<UserStore>} User store object
 */
async function readUsersDatabase() {
  return new Promise((resolve, reject) => {
    fs.readFile(USERS_FILE, 'utf8', (err, data) => {
      if (err) {
        // File doesn't exist - return empty store
        if (err.code === 'ENOENT') {
          resolve({
            version: 1,
            lastUpdated: Date.now(),
            users: {}
          });
          return;
        }
        reject(new Error(`Failed to read users database: ${err.message}`));
        return;
      }

      try {
        const store = JSON.parse(data);
        // Validate structure
        if (!store || typeof store !== 'object' || !store.users) {
          // Invalid format - reset to empty
          resolve({
            version: 1,
            lastUpdated: Date.now(),
            users: {}
          });
          return;
        }
        resolve(store);
      } catch (parseErr) {
        reject(new Error(`Failed to parse users database: ${parseErr.message}`));
      }
    });
  });
}

/**
 * Writes the users database to disk
 * @param {UserStore} store - User store to persist
 * @returns {Promise<void>}
 */
async function writeUsersDatabase(store) {
  return new Promise((resolve, reject) => {
    store.lastUpdated = Date.now();
    const data = JSON.stringify(store, null, 2);

    fs.writeFile(USERS_FILE, data, 'utf8', (err) => {
      if (err) {
        reject(new Error(`Failed to write users database: ${err.message}`));
        return;
      }
      resolve();
    });
  });
}

/**
 * Initializes the user management system
 * Creates data directory and ensures database exists
 * 
 * @returns {Promise<void>}
 * 
 * @example
 * try {
 *   await initialize();
 *   console.log('User system initialized');
 * } catch (err) {
 *   console.error('Initialization failed:', err.message);
 * }
 */
async function initialize() {
  await ensureDataDirectory();
  const store = await readUsersDatabase();
  
  // Ensure structure is valid
  if (!store.version) store.version = 1;
  if (!store.users) store.users = {};
  
  await writeUsersDatabase(store);
  log('info', `User system initialized with ${Object.keys(store.users).length} users`);
}

/**
 * Registers a new user account
 * 
 * @param {string} username - Desired username (3-32 characters)
 * @param {string} password - Plain text password (min 6 characters)
 * @returns {Promise<{success: boolean, message: string}>} Registration result
 * 
 * @example
 * const result = await registerUser('john', 'secret123');
 * if (result.success) {
 *   console.log('User registered successfully');
 * } else {
 *   console.log('Registration failed:', result.message);
 * }
 */
async function registerUser(username, password) {
  // Input validation
  if (!username || typeof username !== 'string') {
    return { success: false, message: 'Username is required' };
  }

  if (!password || typeof password !== 'string') {
    return { success: false, message: 'Password is required' };
  }

  // Username validation
  const trimmedUsername = username.trim();
  if (trimmedUsername.length < 3) {
    return { success: false, message: 'Username must be at least 3 characters' };
  }
  if (trimmedUsername.length > 32) {
    return { success: false, message: 'Username must be at most 32 characters' };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmedUsername)) {
    return { success: false, message: 'Username can only contain letters, numbers, underscores, and hyphens' };
  }

  // Password validation
  if (password.length < 6) {
    return { success: false, message: 'Password must be at least 6 characters' };
  }
  if (password.length > 128) {
    return { success: false, message: 'Password is too long' };
  }

  try {
    const store = await readUsersDatabase();

    // Check if username already exists
    if (store.users[trimmedUsername]) {
      return { success: false, message: 'Username already exists' };
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user object
    const user = {
      username: trimmedUsername,
      passwordHash,
      createdAt: Date.now(),
      lastLogin: null,
      metadata: {
        displayName: trimmedUsername,
        theme: 'dark',
        language: 'en'
      }
    };

    // Add to store and persist
    store.users[trimmedUsername] = user;
    await writeUsersDatabase(store);

    log('info', `User registered: ${trimmedUsername}`);
    return { success: true, message: 'Registration successful' };

  } catch (err) {
    log('error', `Registration failed for ${username}: ${err.message}`);
    return { success: false, message: 'Registration failed due to server error' };
  }
}

/**
 * Authenticates a user with username and password
 * 
 * @param {string} username - Username to authenticate
 * @param {string} password - Plain text password
 * @returns {Promise<{success: boolean, message: string, user?: User}>} Auth result
 * 
 * @example
 * const result = await authenticateUser('john', 'secret123');
 * if (result.success) {
 *   console.log('Authenticated as:', result.user.username);
 * }
 */
async function authenticateUser(username, password) {
  // Input validation
  if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
    return { success: false, message: 'Username and password are required' };
  }

  try {
    const store = await readUsersDatabase();
    const user = store.users[username];

    // User not found
    if (!user) {
      log('warn', `Login attempt for non-existent user: ${username}`);
      // Use consistent timing to prevent timing attacks
      await bcrypt.compare(password, '$2b$10$placeholder.hash.to.prevent.timing.attacks');
      return { success: false, message: 'Invalid username or password' };
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.passwordHash);

    if (!passwordValid) {
      log('warn', `Failed login attempt for user: ${username}`);
      return { success: false, message: 'Invalid username or password' };
    }

    // Update last login timestamp
    user.lastLogin = Date.now();
    await writeUsersDatabase(store);

    log('info', `User logged in: ${username}`);

    // Return user without password hash
    const { passwordHash, ...safeUser } = user;
    return {
      success: true,
      message: 'Login successful',
      user: safeUser
    };

  } catch (err) {
    log('error', `Authentication failed for ${username}: ${err.message}`);
    return { success: false, message: 'Authentication failed due to server error' };
  }
}

/**
 * Gets user information by username (without sensitive data)
 * 
 * @param {string} username - Username to look up
 * @returns {Promise<User|null>} User object or null if not found
 */
async function getUser(username) {
  try {
    const store = await readUsersDatabase();
    const user = store.users[username];

    if (!user) {
      return null;
    }

    // Return without sensitive data
    const { passwordHash, ...safeUser } = user;
    return safeUser;

  } catch (err) {
    log('error', `Failed to get user ${username}: ${err.message}`);
    return null;
  }
}

/**
 * Gets a list of all registered usernames
 * 
 * @returns {Promise<string[]>} Array of usernames
 */
async function listUsers() {
  try {
    const store = await readUsersDatabase();
    return Object.keys(store.users);
  } catch (err) {
    log('error', `Failed to list users: ${err.message}`);
    return [];
  }
}

/**
 * Updates user metadata
 * 
 * @param {string} username - Username to update
 * @param {Object} metadata - Metadata fields to update
 * @returns {Promise<{success: boolean, message: string}>} Update result
 */
async function updateUserMetadata(username, metadata) {
  try {
    const store = await readUsersDatabase();
    const user = store.users[username];

    if (!user) {
      return { success: false, message: 'User not found' };
    }

    // Merge metadata
    user.metadata = {
      ...user.metadata,
      ...metadata
    };

    await writeUsersDatabase(store);
    return { success: true, message: 'Metadata updated' };

  } catch (err) {
    log('error', `Failed to update metadata for ${username}: ${err.message}`);
    return { success: false, message: 'Failed to update metadata' };
  }
}

/**
 * Deletes a user account
 * 
 * @param {string} username - Username to delete
 * @returns {Promise<{success: boolean, message: string}>} Deletion result
 */
async function deleteUser(username) {
  try {
    const store = await readUsersDatabase();

    if (!store.users[username]) {
      return { success: false, message: 'User not found' };
    }

    delete store.users[username];
    await writeUsersDatabase(store);

    log('info', `User deleted: ${username}`);
    return { success: true, message: 'User deleted successfully' };

  } catch (err) {
    log('error', `Failed to delete user ${username}: ${err.message}`);
    return { success: false, message: 'Failed to delete user' };
  }
}

/**
 * Checks if a username is available
 * 
 * @param {string} username - Username to check
 * @returns {Promise<boolean>} True if available, false if taken
 */
async function isUsernameAvailable(username) {
  try {
    const store = await readUsersDatabase();
    return !store.users[username];
  } catch (err) {
    log('error', `Failed to check username availability: ${err.message}`);
    return false;
  }
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
  
  // Only log if level is >= current LOG_LEVEL
  const currentLevel = (process.env.LOG_LEVEL || 'info').toUpperCase();
  if (levels.indexOf(level) < levels.indexOf(currentLevel)) {
    return;
  }
  
  console.log(`[${timestamp}] [${logLevel}] [users] ${message}`);
}

// Export all functions and utilities
module.exports = {
  // Initialization
  initialize,

  // User operations
  registerUser,
  authenticateUser,
  getUser,
  listUsers,
  updateUserMetadata,
  deleteUser,
  isUsernameAvailable,

  // Logging
  log
};
