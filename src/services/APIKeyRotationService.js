import config from '../config/index.js';
import { classifyProviderError, getBackoffDelayMs, sleep } from '../utils/index.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export class APIKeyRotationService {
  constructor() {
    this.keys = config.openrouterKeys || [];
    this.fallbackKey = config.openrouterKeyFallback;
    this.currentKeyIndex = 0;
    this.keyFailures = {}; // Track failures per key
    this.keyDisabled = {}; // Keys disabled for this process lifecycle
    this.keyStats = {}; // Track usage stats per key

    // Initialize tracking objects
    this.keys.forEach((key, idx) => {
      const keyId = `KEY_${idx + 1}`;
      this.keyFailures[keyId] = 0;
      this.keyDisabled[keyId] = false;
      this.keyStats[keyId] = {
        uses: 0,
        failures: 0,
        successes: 0,
        lastUsed: null,
      };
    });

    this.keyFailures['FALLBACK'] = 0;
    this.keyDisabled['FALLBACK'] = false;
    this.keyStats['FALLBACK'] = {
      uses: 0,
      failures: 0,
      successes: 0,
      lastUsed: null,
    };
  }

  /**
   * Get the next API key to use (rotation + fallback logic)
   * Priority:
   * 1. Rotate through primary keys (KEY_1, KEY_2, KEY_3)
   * 2. If primary key is healthy (low failures), use it
   * 3. If primary key has too many failures, skip to next
   * 4. If all primary keys failed too much, use fallback
   */
  getNextKey(allowFallback = true) {
    const MAX_FAILURES_BEFORE_SKIP = 3;
    const totalKeys = this.keys.length;

    if (totalKeys === 0 && !this.fallbackKey) {
      throw new Error('No OpenRouter API keys configured');
    }

    // Try to find a healthy primary key
    for (let i = 0; i < totalKeys; i++) {
      const keyId = `KEY_${(this.currentKeyIndex % totalKeys) + 1}`;
      this.currentKeyIndex = (this.currentKeyIndex + 1) % totalKeys;

      if (this.keyFailures[keyId] < MAX_FAILURES_BEFORE_SKIP) {
        const keyIndex = parseInt(keyId.split('_')[1]) - 1;
        return {
          key: this.keys[keyIndex],
          keyId,
          isFallback: false,
        };
      }
    }

    if (!allowFallback) {
      throw new Error('No healthy primary OpenRouter API keys available');
    }

    // All primary keys have too many failures, use fallback
    console.log('[APIKeyRotation] All primary keys have too many failures or were already tried, using FALLBACK key');
    return {
      key: this.fallbackKey,
      keyId: 'FALLBACK',
      isFallback: true,
    };
  }

  /**
   * Record a successful API call
   */
  recordSuccess(keyId) {
    this.keyFailures[keyId] = Math.max(0, this.keyFailures[keyId] - 1); // Decrease failure count on success
    if (this.keyStats[keyId]) {
      this.keyStats[keyId].successes += 1;
      this.keyStats[keyId].uses += 1;
      this.keyStats[keyId].lastUsed = new Date();
    }
    console.log(`[APIKeyRotation] ${keyId} - Success (failures: ${this.keyFailures[keyId]}, successes: ${this.keyStats[keyId]?.successes || 0})`);
  }

  /**
   * Record a failed API call
   */
  recordFailure(keyId, error) {
    const category = classifyProviderError(error?.status || 0, error?.message || '');
    this.keyFailures[keyId] += 1;

    if (category === 'auth' || category === 'credit') {
      this.keyDisabled[keyId] = true;
    }

    if (this.keyStats[keyId]) {
      this.keyStats[keyId].failures += 1;
      this.keyStats[keyId].uses += 1;
      this.keyStats[keyId].lastUsed = new Date();
    }
    console.log(`[APIKeyRotation] ${keyId} - Failure (total failures: ${this.keyFailures[keyId]}, disabled: ${this.keyDisabled[keyId]}, reason: ${error.message})`);
  }

  /**
   * Call OpenRouter with automatic retry and fallback
   */
  async callWithRotation(model, messages, maxTokens = 4096, maxRetries = 3) {
    let lastError = null;
    const availableKeys = this.keys.length + (this.fallbackKey ? 1 : 0);
    let attemptsRemaining = Math.max(maxRetries, availableKeys);
    const attemptedKeys = new Set();
    const totalAttempts = attemptsRemaining;

    while (attemptsRemaining > 0) {
      let keyInfo = null;
      try {
        keyInfo = this.getNextUntriedKey(attemptedKeys);
      } catch (error) {
        lastError = error;
        break;
      }

      const { key, keyId } = keyInfo;
      attemptedKeys.add(keyId);

      if (!key) {
        throw new Error('No OpenRouter API keys available');
      }

      try {
        console.log(`[APIKeyRotation] Attempt ${totalAttempts - attemptsRemaining + 1}/${totalAttempts} with ${keyId}`);

        const response = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens,
          }),
        });

        if (!response.ok) {
          const error = await this.readError(response);
          const message = `${response.status}: ${error.error?.message || error.message || JSON.stringify(error)}`;
          const wrapped = new Error(message);
          wrapped.status = response.status;
          wrapped.retryAfter = response.headers.get('Retry-After');
          throw wrapped;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
          throw new Error('Empty response from OpenRouter');
        }

        this.recordSuccess(keyId);
        return content;
      } catch (error) {
        lastError = error;
        this.recordFailure(keyId, error);
        attemptsRemaining -= 1;

        if (attemptsRemaining === 0) {
          console.log(`[APIKeyRotation] All retry attempts exhausted`);
          break;
        }

        const category = classifyProviderError(error?.status || 0, error?.message || '');
        if (category === 'rate_limit' || category === 'transient') {
          const delayMs = getBackoffDelayMs(totalAttempts - attemptsRemaining, category, error?.retryAfter);
          await sleep(delayMs);
        }

        console.log(`[APIKeyRotation] Retrying with another key... (${attemptsRemaining} retries remaining)`);
      }
    }

    throw new Error(`All OpenRouter API calls failed. Last error: ${lastError?.message}`);
  }

  getNextUntriedKey(attemptedKeys) {
    const totalKeys = this.keys.length;

    for (let i = 0; i < totalKeys; i++) {
      const keyId = `KEY_${(this.currentKeyIndex % totalKeys) + 1}`;
      this.currentKeyIndex = (this.currentKeyIndex + 1) % totalKeys;

      if (!attemptedKeys.has(keyId) && !this.keyDisabled[keyId]) {
        const keyIndex = parseInt(keyId.split('_')[1]) - 1;
        return {
          key: this.keys[keyIndex],
          keyId,
          isFallback: false,
        };
      }
    }

    if (this.fallbackKey && !attemptedKeys.has('FALLBACK') && !this.keyDisabled.FALLBACK) {
      return {
        key: this.fallbackKey,
        keyId: 'FALLBACK',
        isFallback: true,
      };
    }

    throw new Error('No untried OpenRouter API keys available');
  }

  async readError(response) {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { message: text.slice(0, 200) };
    }
  }

  /**
   * Get rotation stats for monitoring
   */
  getStats() {
    return {
      keys: this.keys.length,
      currentIndex: this.currentKeyIndex,
      stats: this.keyStats,
      failures: this.keyFailures,
    };
  }

  /**
   * Reset failure counts for a key
   */
  resetKeyFailures(keyId) {
    if (this.keyFailures.hasOwnProperty(keyId)) {
      this.keyFailures[keyId] = 0;
      console.log(`[APIKeyRotation] Reset failures for ${keyId}`);
    }
  }

  /**
   * Reset all failure counts
   */
  resetAllFailures() {
    Object.keys(this.keyFailures).forEach((key) => {
      this.keyFailures[key] = 0;
    });
    console.log('[APIKeyRotation] Reset all failure counts');
  }
}

export const apiKeyRotationService = new APIKeyRotationService();
