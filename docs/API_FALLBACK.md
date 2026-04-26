# API Fallback System

This document details the multi-layer fallback system that ensures high availability for the CV Analyzer Bot.

## Table of Contents

- [Overview](#overview)
- [AI Provider Fallback](#ai-provider-fallback)
- [Parser Fallback Chain](#parser-fallback-chain)
- [API Key Rotation](#api-key-rotation)
- [Circuit Breaker Pattern](#circuit-breaker-pattern)
- [Error Classification](#error-classification)
- [Retry Strategy](#retry-strategy)

---

## Overview

The bot employs a **defense-in-depth** strategy for API reliability:

```
┌─────────────────────────────────────────────────────────────────┐
│                  Multi-Layer Fallback Architecture               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 1: API Key Rotation (per provider)                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  OpenRouter: KEY_1 → KEY_2 → KEY_3 → FALLBACK_KEY      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Layer 2: AI Provider Fallback                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  OpenRouter → Gemini → OpenAI → Default Score          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Layer 3: Parser Fallback                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  APILayer → CVParser → UseResume → AI Extraction       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Layer 4: Format Fallback                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Parsed Data → Raw Text Only → Error Message           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## AI Provider Fallback

### Primary Chain

```
┌─────────────────────────────────────────────────────────────────┐
│                   AI Provider Fallback Chain                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1️⃣ OpenRouter (GPT-4o-mini)                                   │
│     - Endpoint: https://openrouter.ai/api/v1/chat/completions  │
│     - Model: openai/gpt-4o-mini                                │
│     - Keys: 3 primary + 1 fallback                             │
│     - Timeout: 30 seconds                                      │
│                                                                 │
│     │ (on failure)                                              │
│     ▼                                                           │
│  2️⃣ Google Gemini (gemini-2.5-flash)                           │
│     - Endpoint: https://generativelanguage.googleapis.com/...  │
│     - Model: gemini-2.5-flash                                  │
│     - Keys: 1 key                                              │
│     - Timeout: 30 seconds                                      │
│                                                                 │
│     │ (on failure)                                              │
│     ▼                                                           │
│  3️⃣ Default Score                                               │
│     - Score: 50/100                                            │
│     - Used when all AI providers fail                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation (AIService.js)

```javascript
async analyzeCV(cvText, jobDescription) {
  const systemPrompt = await this.getResumeScoreSystemPrompt();
  const prompt = `Analyze the resume and job description...`;

  try {
    // Primary: OpenRouter
    const result = await this.callOpenRouter(prompt, 4096, systemPrompt);
    return this.parseJSON(result) || this.getDefaultAnalysis();
  } catch (e1) {
    console.log('[AI] OpenRouter failed, trying Gemini:', e1.message);
    try {
      // Secondary: Gemini
      const result = await this.callGemini(prompt, { 
        systemPrompt, 
        responseMimeType: 'application/json' 
      });
      return this.parseJSON(result) || this.getDefaultAnalysis();
    } catch (e2) {
      console.log('[AI] Gemini failed');
      return this.getDefaultAnalysis();
    }
  }
}
```

### Fallback Decision Matrix

| Scenario | Action |
|----------|--------|
| OpenRouter succeeds | Use OpenRouter result |
| OpenRouter fails, Gemini succeeds | Use Gemini result |
| Both fail | Return default analysis (score: 50) |
| OpenRouter timeout | Retry once, then fallback to Gemini |
| Gemini timeout | Return default analysis |

---

## Parser Fallback Chain

### Parser Priority

```
┌─────────────────────────────────────────────────────────────────┐
│                  Resume Parser Fallback Chain                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1️⃣ APILayer (Primary)                                         │
│     - Type: REST API                                            │
│     - Keys: 4 keys with rotation                               │
│     - Best for: Clean, structured PDFs                         │
│     - Success rate: ~85%                                       │
│                                                                 │
│     │ (on failure)                                              │
│     ▼                                                           │
│  2️⃣ CVParser (Secondary)                                       │
│     - Type: GraphQL API                                         │
│     - Keys: 4 keys with rotation                               │
│     - Best for: Complex layouts                                │
│     - Success rate: ~75%                                       │
│                                                                 │
│     │ (on failure)                                              │
│     ▼                                                           │
│  3️⃣ UseResume (Tertiary)                                       │
│     - Type: REST API                                            │
│     - Keys: 3 keys with rotation                               │
│     - Best for: Modern formats                                 │
│     - Success rate: ~70%                                       │
│                                                                 │
│     │ (on failure)                                              │
│     ▼                                                           │
│  4️⃣ AI Extraction (Fallback)                                   │
│     - Type: LLM (OpenRouter/Gemini)                            │
│     - Best for: OCR/images, unstructured text                  │
│     - Success rate: ~90% (with trade-offs)                     │
│                                                                 │
│     │ (on failure)                                              │
│     ▼                                                           │
│  5️⃣ Raw Text Only (Final)                                      │
│     - Use extracted text without structured parsing            │
│     - Always works for scoring                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation (CVController.js)

```javascript
async parseWholeCVWithFallbacks({ bufferArr, fileName, fileLink, cvText, ctx }) {
  const parserAttempts = [];

  // 1) APILayer
  try {
    console.log('[CVController] Trying APILayer parser...');
    const parseResult = await apiLayerService.parseResumeFromBuffer(bufferArr, fileName);
    const parsedData = this.buildFullCVParsedData(parseResult.data, cvText, 'apilayer');
    return { parsedData, parserSource: 'apilayer', parserAttempts };
  } catch (error) {
    parserAttempts.push({ source: 'apilayer', error: error.message });
    console.log('[CVController] APILayer failed, trying next parser');
  }

  // 2) CVParser
  try {
    console.log('[CVController] Trying CVParser parser...');
    const parseResult = await cvParserService.parseResume(fileLink.toString());
    const extracted = cvParserService.extractParsedData(parseResult.data);
    const parsedData = this.buildFullCVParsedData(extracted, cvText, 'cvparser');
    return { parsedData, parserSource: 'cvparser', parserAttempts };
  } catch (error) {
    parserAttempts.push({ source: 'cvparser', error: error.message });
  }

  // 3) UseResume
  try {
    console.log('[CVController] Trying UseResume parser...');
    const useResumeResult = await useResumeService.parseResume(bufferArr, fileName);
    const parsedData = this.buildFullCVParsedData(useResumeResult.data, cvText, 'useresume');
    return { parsedData, parserSource: 'useresume', parserAttempts };
  } catch (error) {
    parserAttempts.push({ source: 'useresume', error: error.message });
  }

  // 4) AI Fallback
  try {
    console.log('[CVController] Trying AI parser fallback...');
    const aiParsedData = await aiService.extractResumeDataWithOpenRouter(cvText);
    const parsedData = this.buildFullCVParsedData(aiParsedData, cvText, 'ai_fallback');
    return { parsedData, parserSource: 'ai_fallback', parserAttempts };
  } catch (error) {
    parserAttempts.push({ source: 'ai_fallback', error: error.message });
  }

  // 5) Final fallback: text only
  const parsedData = this.buildFullCVParsedData({}, cvText, 'text_only_fallback');
  return { parsedData, parserSource: 'text_only_fallback', parserAttempts };
}
```

---

## API Key Rotation

### OpenRouter Key Rotation

```
┌─────────────────────────────────────────────────────────────────┐
│               OpenRouter Key Rotation Strategy                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Keys Available:                                                │
│  - PRIMARY_0: OPENROUTER_KEY_1                                  │
│  - PRIMARY_1: OPENROUTER_KEY_2                                  │
│  - PRIMARY_2: OPENROUTER_KEY_3                                  │
│  - FALLBACK_0: OPENROUTER_KEY_FALLBACK                          │
│                                                                 │
│  Strategy: Round-Robin with Circuit Breaker                     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Request 1 → PRIMARY_0 (index 0)                         │  │
│  │  Request 2 → PRIMARY_1 (index 1)                         │  │
│  │  Request 3 → PRIMARY_2 (index 2)                         │  │
│  │  Request 4 → PRIMARY_0 (wrap around)                     │  │
│  │  ...                                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  If PRIMARY key fails:                                          │
│  - Increment failure count                                      │
│  - At 5 failures: Open circuit (skip for 60s)                   │
│  - Try next available key                                       │
│                                                                 │
│  If all PRIMARY keys fail:                                      │
│  - Use FALLBACK_0                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Health Tracking

```javascript
// From APIKeyRotationService.js

keyCircuitState = {
  'PRIMARY_0': 'closed',    // Healthy
  'PRIMARY_1': 'open',      // Failing, skip
  'PRIMARY_2': 'half-open', // Testing recovery
  'FALLBACK_0': 'closed'
};

keyFailures = {
  'PRIMARY_0': 0,
  'PRIMARY_1': 5,
  'PRIMARY_2': 3,
  'FALLBACK_0': 0
};

keySuccesses = {
  'PRIMARY_0': 150,
  'PRIMARY_1': 80,
  'PRIMARY_2': 45,
  'FALLBACK_0': 20
};
```

---

## Circuit Breaker Pattern

### State Transitions

```
┌─────────────────────────────────────────────────────────────────┐
│                  Circuit Breaker State Machine                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│         ┌─────────────────────────────────────────────┐         │
│         │            CLOSED (Healthy)                 │         │
│         │  - Requests flow normally                   │         │
│         │  - Failure count: 0                         │         │
│         └──────────────────┬──────────────────────────┘         │
│                            │                                    │
│                            │ 5 consecutive failures             │
│                            ▼                                    │
│         ┌─────────────────────────────────────────────┐         │
│         │             OPEN (Tripped)                  │         │
│         │  - Requests blocked                         │         │
│         │  - Recovery timeout: 60 seconds             │         │
│         └──────────────────┬──────────────────────────┘         │
│                            │                                    │
│                            │ Timeout expires                    │
│                            ▼                                    │
│         ┌─────────────────────────────────────────────┐         │
│         │           HALF-OPEN (Testing)               │         │
│         │  - Allow test requests                      │         │
│         │  - Need 2 consecutive successes             │         │
│         └──────────────────┬──────────────────────────┘         │
│                     │                    │                      │
│              2 successes          Any failure                   │
│                     │                    │                      │
│                     ▼                    ▼                      │
│              CLOSED              OPEN                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Configuration

```javascript
// APIKeyRotationService.js

CIRCUIT_FAILURE_THRESHOLD = 5;       // Open circuit after 5 failures
CIRCUIT_RECOVERY_TIMEOUT_MS = 60000; // 60 seconds before retry
HALF_OPEN_TEST_REQUESTS = 2;         // Successes needed to close
```

---

## Error Classification

### Error Categories

```javascript
// From utils/index.js

export function classifyProviderError(status, message) {
  const lowerMessage = String(message).toLowerCase();

  // Authentication errors (permanent - disable key)
  if (status === 401 || status === 403 || 
      lowerMessage.includes('auth') || 
      lowerMessage.includes('api key')) {
    return 'auth';
  }

  // Credit/billing errors (permanent - disable key)
  if (lowerMessage.includes('credit') || 
      lowerMessage.includes('billing') ||
      lowerMessage.includes('quota')) {
    return 'credit';
  }

  // Rate limiting (retryable with backoff)
  if (status === 429 || lowerMessage.includes('rate limit')) {
    return 'rate_limit';
  }

  // Server errors (retryable)
  if (status >= 500 && status < 600) {
    return 'server';
  }

  // Network/transient errors (retryable)
  if (status === 0 || 
      lowerMessage.includes('network') ||
      lowerMessage.includes('timeout') ||
      lowerMessage.includes('fetch')) {
    return 'transient';
  }

  // Unknown (treat as retryable)
  return 'unknown';
}
```

### Error Handling Strategy

| Category | Action | Retry? | Disable Key? |
|----------|--------|--------|--------------|
| `auth` | Skip key | No | Yes (permanent) |
| `credit` | Skip key | No | Yes (permanent) |
| `rate_limit` | Backoff | Yes (with delay) | No |
| `server` | Backoff | Yes | No |
| `transient` | Backoff | Yes | No |
| `unknown` | Backoff | Yes | No |

---

## Retry Strategy

### Exponential Backoff with Jitter

```javascript
// From utils/index.js

export function getBackoffDelayMs(attempt, category, retryAfterHeader) {
  // Respect Retry-After header if present
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }
  }

  // Base delays by category
  const baseDelays = {
    rate_limit: 1000,  // 1 second
    server: 500,       // 0.5 seconds
    transient: 250,    // 0.25 seconds
    unknown: 500,      // 0.5 seconds
  };

  const baseDelay = baseDelays[category] || 500;

  // Exponential backoff: base * 2^(attempt-1)
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);

  // Add jitter: ±25% randomization
  const jitter = (Math.random() - 0.5) * 0.5 * exponentialDelay;

  // Cap at 10 seconds
  return Math.min(10000, exponentialDelay + jitter);
}
```

### Retry Flow

```
Attempt 1: 500ms base delay
Attempt 2: 1000ms (500 * 2^1)
Attempt 3: 2000ms (500 * 2^2)
Attempt 4: 4000ms (500 * 2^3)
Attempt 5: 8000ms (500 * 2^4) - capped near 10s

With jitter applied:
- Attempt 3 could be 1500ms to 2500ms
- Prevents thundering herd on recovery
```

### Retry Logging

```
[APIKeyRotation] Attempt 1/3 using PRIMARY_0 (circuit: closed)
[APIKeyRotation] ✗ PRIMARY_0 failure #1 (threshold: 5) - reason: Rate limited
[APIKeyRotation] Waiting 1247ms before retry...
[APIKeyRotation] Attempt 2/3 using PRIMARY_1 (circuit: closed)
[APIKeyRotation] ✓ PRIMARY_1 success (total: 151, success rate: 98.7%)
```

---

## Monitoring and Observability

### Key Metrics Tracked

```javascript
// getStats() returns:

{
  totalKeys: 4,
  currentIndex: 2,
  keys: {
    'PRIMARY_0': {
      circuitState: 'closed',
      totalCalls: 150,
      successes: 148,
      failures: 2,
      successRate: '98.7%',
      lastSuccess: '2024-01-15 10:30:00',
      lastFailure: '2024-01-14 08:15:00'
    },
    // ... other keys
  }
}
```

### Parser Attempt Logging

```javascript
parserAttempts = [
  { source: 'apilayer', error: 'Rate limited' },
  { source: 'cvparser', error: 'Invalid GraphQL response' },
  { source: 'useresume', error: null } // success
];
```

All attempts are logged to MongoDB for debugging and analytics.
