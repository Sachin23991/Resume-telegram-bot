import config from '../config/index.js';
import { classifyProviderError, getBackoffDelayMs, sleep } from '../utils/index.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Unified API Key Rotation Service with Circuit Breaker Pattern
 *
 * Key Features:
 * - Circuit breaker pattern (closed → open → half-open)
 * - Health tracking with automatic recovery
 * - Per-key failure counting before disabling
 * - Exponential backoff with jitter
 * - Clear logging of which key was used
 */
export class APIKeyRotationService {
  constructor() {
    // All keys organized by provider
    this.openrouterKeys = config.openrouterKeys || [];
    this.fallbackKey = config.openrouterKeyFallback;

    // Current index for round-robin
    this.currentKeyIndex = 0;

    // Circuit breaker state per key
    // States: 'closed' (healthy), 'open' (failing), 'half-open' (testing recovery)
    this.keyCircuitState = {};
    this.keyFailures = {};
    this.keySuccesses = {};
    this.keyLastFailureTime = {};
    this.keyLastSuccessTime = {};
    this.keyTotalCalls = {};

    // Circuit breaker thresholds
    this.CIRCUIT_FAILURE_THRESHOLD = 5;  // Open circuit after 5 consecutive failures
    this.CIRCUIT_RECOVERY_TIMEOUT_MS = 60000; // Try recovery after 60 seconds
    this.HALF_OPEN_TEST_REQUESTS = 2;  // Need 2 successful calls to close circuit

    // Initialize tracking for all keys
    this._initKeyTracking('PRIMARY', this.openrouterKeys);
    this._initKeyTracking('FALLBACK', this.fallbackKey ? [this.fallbackKey] : []);
  }

  _initKeyTracking(prefix, keys) {
    keys.forEach((_, idx) => {
      const keyId = `${prefix}_${idx}`;
      this.keyCircuitState[keyId] = 'closed';
      this.keyFailures[keyId] = 0;
      this.keySuccesses[keyId] = 0;
      this.keyLastFailureTime[keyId] = null;
      this.keyLastSuccessTime[keyId] = null;
      this.keyTotalCalls[keyId] = 0;
    });
  }

  /**
   * Get the circuit breaker state for a key
   */
  _getCircuitState(keyId) {
    const state = this.keyCircuitState[keyId];
    if (state !== 'open') return state;

    // Check if recovery timeout has passed - move to half-open
    const lastFailure = this.keyLastFailureTime[keyId];
    if (lastFailure && Date.now() - lastFailure > this.CIRCUIT_RECOVERY_TIMEOUT_MS) {
      this.keyCircuitState[keyId] = 'half-open';
      console.log(`[APIKeyRotation] ${keyId} circuit recovered, testing with half-open state`);
      return 'half-open';
    }
    return 'open';
  }

  /**
   * Record successful API call
   */
  recordSuccess(keyId) {
    this.keyFailures[keyId] = 0; // Reset failures on success
    this.keySuccesses[keyId] = (this.keySuccesses[keyId] || 0) + 1;
    this.keyLastSuccessTime[keyId] = Date.now();
    this.keyTotalCalls[keyId] = (this.keyTotalCalls[keyId] || 0) + 1;

    // If in half-open state, need consecutive successes to close circuit
    if (this.keyCircuitState[keyId] === 'half-open') {
      const recentSuccesses = this.keySuccesses[keyId];
      if (recentSuccesses >= this.HALF_OPEN_TEST_REQUESTS) {
        this.keyCircuitState[keyId] = 'closed';
        console.log(`[APIKeyRotation] ${keyId} circuit CLOSED - recovered to healthy state`);
      }
    }

    const totalCalls = this.keyTotalCalls[keyId];
    const successRate = totalCalls > 0 ? ((this.keySuccesses[keyId] / totalCalls) * 100).toFixed(1) : '100';
    console.log(`[APIKeyRotation] ✓ ${keyId} success (total: ${totalCalls}, success rate: ${successRate}%)`);
  }

  /**
   * Record failed API call
   */
  recordFailure(keyId, error) {
    const status = error?.status || 0;
    const message = error?.message || '';
    const category = classifyProviderError(status, message);

    this.keyFailures[keyId] = (this.keyFailures[keyId] || 0) + 1;
    this.keyLastFailureTime[keyId] = Date.now();
    this.keyTotalCalls[keyId] = (this.keyTotalCalls[keyId] || 0) + 1;

    // Auth/credit errors permanently disable the key
    if (category === 'auth' || category === 'credit') {
      this.keyCircuitState[keyId] = 'open';
      console.log(`[APIKeyRotation] ✗ ${keyId} auth/credit error - permanently disabling`);
      return;
    }

    // Check if we should open the circuit
    if (this.keyFailures[keyId] >= this.CIRCUIT_FAILURE_THRESHOLD) {
      this.keyCircuitState[keyId] = 'open';
      const nextRecovery = new Date(Date.now() + this.CIRCUIT_RECOVERY_TIMEOUT_MS).toLocaleTimeString();
      console.log(`[APIKeyRotation] ✗ ${keyId} circuit OPENED - too many failures, will retry after ${new Date(nextRecovery).toLocaleTimeString()}`);
    } else {
      console.log(`[APIKeyRotation] ✗ ${keyId} failure #${this.keyFailures[keyId]} (threshold: ${this.CIRCUIT_FAILURE_THRESHOLD}) - reason: ${message}`);
    }
  }

  /**
   * Get next available key with circuit breaker awareness
   * Returns the key with its metadata
   */
  getNextAvailableKey() {
    // Try primary keys in round-robin
    for (let attempt = 0; attempt < this.openrouterKeys.length; attempt++) {
      const keyIdx = this.currentKeyIndex % this.openrouterKeys.length;
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.openrouterKeys.length;
      const keyId = `PRIMARY_${keyIdx}`;

      const circuitState = this._getCircuitState(keyId);
      if (circuitState === 'closed' || circuitState === 'half-open') {
        return {
          key: this.openrouterKeys[keyIdx],
          keyId,
          isFallback: false
        };
      }
    }

    // All primary keys are circuit-open, try fallback
    if (this.fallbackKey) {
      const fallbackKeyId = 'FALLBACK_0';
      const circuitState = this._getCircuitState(fallbackKeyId);

      if (circuitState === 'closed' || circuitState === 'half-open') {
        return {
          key: this.fallbackKey,
          keyId: fallbackKeyId,
          isFallback: true
        };
      }
    }

    // No healthy keys available - all circuits are open
    // Force retry of first key (circuit breaker will allow half-open state)
    console.log(`[APIKeyRotation] WARNING: All circuits open, forcing retry of first key`);
    this.keyCircuitState['PRIMARY_0'] = 'half-open';
    return {
      key: this.openrouterKeys[0],
      keyId: 'PRIMARY_0',
      isFallback: false
    };
  }

  /**
   * Call OpenRouter with automatic retry and circuit breaker
   */
  async callWithRotation(model, messages, maxTokens = 4096, maxRetries = 3) {
    let lastError = null;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const keyInfo = this.getNextAvailableKey();
      console.log(`[APIKeyRotation] Attempt ${attempt}/${maxRetries} using ${keyInfo.keyId} (circuit: ${this._getCircuitState(keyInfo.keyId)})`);

      try {
        const response = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${keyInfo.key}`,
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens,
          }),
        });

        if (!response.ok) {
          const error = await this._readError(response);
          const errorMsg = error.error?.message || error.message || JSON.stringify(error);
          const wrapped = new Error(errorMsg);
          wrapped.status = response.status;
          wrapped.retryAfter = response.headers.get('Retry-After');
          throw wrapped;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
          throw new Error('Empty response from OpenRouter');
        }

        this.recordSuccess(keyInfo.keyId);
        const duration = Date.now() - startTime;
        console.log(`[APIKeyRotation] ✓ Successfully completed in ${duration}ms using ${keyInfo.keyId}`);
        return content;

      } catch (error) {
        lastError = error;
        this.recordFailure(keyInfo.keyId, error);

        const category = classifyProviderError(error?.status || 0, error?.message || '');
        const isRetryable = category === 'rate_limit' || category === 'transient';

        console.log(`[APIKeyRotation] ✗ ${keyInfo.keyId} failed: ${error.message} (category: ${category}, retryable: ${isRetryable})`);

        if (isRetryable && attempt < maxRetries) {
          const delayMs = getBackoffDelayMs(attempt, category, error?.retryAfter);
          console.log(`[APIKeyRotation] Waiting ${delayMs}ms before retry...`);
          await sleep(delayMs);
        }

        // If circuit is now open for this key, immediately try next key
        if (this._getCircuitState(keyInfo.keyId) === 'open' && attempt < maxRetries) {
          console.log(`[APIKeyRotation] ${keyInfo.keyId} circuit is open, skipping to next key`);
        }
      }
    }

    throw new Error(`All OpenRouter API calls failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
  }

  async _readError(response) {
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
    const stats = {};
    const allKeyIds = [
      ...this.openrouterKeys.map((_, i) => `PRIMARY_${i}`),
      ...(this.fallbackKey ? ['FALLBACK_0'] : [])
    ];

    for (const keyId of allKeyIds) {
      const totalCalls = this.keyTotalCalls[keyId] || 0;
      const successes = this.keySuccesses[keyId] || 0;
      const failures = this.keyFailures[keyId] || 0;
      stats[keyId] = {
        circuitState: this.keyCircuitState[keyId] || 'closed',
        totalCalls,
        successes,
        failures,
        successRate: totalCalls > 0 ? ((successes / totalCalls) * 100).toFixed(1) + '%' : 'N/A',
        lastSuccess: this.keyLastSuccessTime[keyId] ? new Date(this.keyLastSuccessTime[keyId]).toLocaleString() : 'Never',
        lastFailure: this.keyLastFailureTime[keyId] ? new Date(this.keyLastFailureTime[keyId]).toLocaleString() : 'Never',
      };
    }

    return {
      totalKeys: this.openrouterKeys.length + (this.fallbackKey ? 1 : 0),
      currentIndex: this.currentKeyIndex,
      keys: stats
    };
  }

  /**
   * Reset circuit breakers for all keys (use after system recovery)
   */
  resetAllCircuits() {
    const allKeyIds = [
      ...this.openrouterKeys.map((_, i) => `PRIMARY_${i}`),
      ...(this.fallbackKey ? ['FALLBACK_0'] : [])
    ];

    for (const keyId of allKeyIds) {
      this.keyCircuitState[keyId] = 'closed';
      this.keyFailures[keyId] = 0;
      this.keySuccesses[keyId] = 0;
    }
    console.log('[APIKeyRotation] All circuit breakers reset');
  }
}

export const apiKeyRotationService = new APIKeyRotationService();
