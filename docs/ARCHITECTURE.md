# System Architecture

This document provides a deep dive into the CV Analyzer Bot's system architecture, design patterns, and component interactions.

## Table of Contents

- [Overview](#overview)
- [Architectural Patterns](#architectural-patterns)
- [Component Diagram](#component-diagram)
- [Data Flow](#data-flow)
- [Service Layer Architecture](#service-layer-architecture)
- [State Management](#state-management)

---

## Overview

The CV Analyzer Bot is built using a **layered architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  TelegramView   │  │  CVController   │  │   Bot Handlers  │  │
│  │  (Messages/UI)  │  │  (Commands)     │  │  (Events)       │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                         SERVICE LAYER                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │   AI     │ │  Parser  │ │Extractor │ │Document  │ │Rotation│ │
│  │ Service  │ │ Services │ │ Service  │ │ Service  │ │Service │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                        INFRASTRUCTURE LAYER                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   MongoDB       │  │   External APIs │  │   File System   │  │
│  │   (Sessions)    │  │   (AI/Parser)   │  │   (Temp Files)  │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architectural Patterns

### 1. MVC (Model-View-Controller)

| Component | File | Responsibility |
|-----------|------|----------------|
| **Model** | `src/models/UserSession.js` | Session state, data structures |
| **View** | `src/views/TelegramView.js` | Message formatting, UI rendering |
| **Controller** | `src/controllers/CVController.js` | Business logic orchestration |

### 2. Service Layer Pattern

Each external dependency is wrapped in a dedicated service:

```
src/services/
├── AIService.js              → AI provider abstraction
├── APIKeyRotationService.js  → Key rotation & circuit breaker
├── CVExtractorService.js     → PDF/DOCX/OCR extraction
├── APILayerService.js        → APILayer parser integration
├── CVParserService.js        → CVParser GraphQL integration
├── UseResumeService.js       → UseResume REST integration
├── DocumentGeneratorService.js → PDF/DOCX generation
├── ResumeRendererService.js  → Resume templating & rendering
└── WorkflowStoreService.js   → MongoDB persistence
```

### 3. Chain of Responsibility

Used for fallback chains:

```
Parser Chain:
APILayer → CVParser → UseResume → AI Extraction → Raw Text

AI Provider Chain:
OpenRouter (Primary) → Gemini (Secondary) → OpenAI (Tertiary)
```

### 4. Circuit Breaker Pattern

Implemented in `APIKeyRotationService.js`:

```
States:
┌──────────────┐
│   CLOSED     │ ← Healthy state, requests flow normally
└──────┬───────┘
       │ 5 consecutive failures
       ▼
┌──────────────┐
│    OPEN      │ ← Circuit trips, requests blocked
└──────┬───────┘
       │ 60 second timeout
       ▼
┌──────────────┐
│  HALF-OPEN   │ ← Test with 2 requests
└──────┬───────┘
       │ Both succeed → CLOSED
       │ Any fails → OPEN
```

---

## Component Diagram

### Bot Entry Point (`src/app.js`)

```
┌─────────────────────────────────────────────────────────────┐
│                         app.js                               │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Telegraf Bot Initialization                         │   │
│  │  - Session middleware                                │   │
│  │  - Error handlers                                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Command Handlers                                    │   │
│  │  - /start → cvController.handleStart()               │   │
│  │  - /help → cvController.handleHelp()                 │   │
│  │  - /menu → telegramView.menu()                       │   │
│  │  - /cancel → cvController.handleCancel()             │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Message Handlers                                    │   │
│  │  - document → handleCV() / handleJobDescription()    │   │
│  │  - photo → handleCV() / handleJobDescription()       │   │
│  │  - text → State-based routing                        │   │
│  │  - callback_query → handleActionChoice()             │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Server Setup                                        │   │
│  │  - Production: Webhook mode                          │   │
│  │  - Development: Long polling                         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Complete User Journey

```
User sends /start
    │
    ▼
┌─────────────────────────────────────────┐
│  1. Session Creation                    │
│     - UserSessionStore.create(userId)   │
│     - State: WAITING_CV                 │
│     - MongoDB: upsertStage("start")     │
└─────────────────────────────────────────┘
    │
    ▼
User uploads CV (PDF/DOCX/Image)
    │
    ▼
┌─────────────────────────────────────────┐
│  2. CV Processing                       │
│     - Download file from Telegram       │
│     - Extract text (CVExtractorService) │
│     - Parse structure (Parser Chain)    │
│       APILayer → CVParser → UseResume   │
│     - Store in session                  │
└─────────────────────────────────────────┘
    │
    ▼
Bot: "Now send the job description"
    │
    ▼
User sends JD (text or file)
    │
    ▼
┌─────────────────────────────────────────┐
│  3. Analysis Phase                      │
│     - Extract CV structure (AI)         │
│     - Get suggestions (Gemini/OpenAI)   │
│     - Score match (AI with full text)   │
│     - Store analysis in session         │
│     - State: WAITING_ACTION_CHOICE      │
└─────────────────────────────────────────┘
    │
    ▼
Bot shows: Score + Analysis + Action buttons
    │
    ▼
User clicks action button
    │
    ├──► action_improve → Generate improved CV
    ├──► action_cover → Generate cover letter
    ├──► action_both → Generate both documents
    └──► action_none → End session
    │
    ▼
┌─────────────────────────────────────────┐
│  4. Document Generation                 │
│     - AI rewrites content               │
│     - ResumeRendererService generates   │
│     - Send as Telegram file             │
│     - Delete session                    │
└─────────────────────────────────────────┘
```

---

## Service Layer Architecture

### AIService (`src/services/AIService.js`)

**Responsibilities:**
- AI provider abstraction (OpenRouter, Gemini, OpenAI)
- Structure extraction from CV text
- CV scoring against job descriptions
- Resume rewriting and improvement
- Cover letter generation

**Key Methods:**

| Method | Purpose | Fallback Chain |
|--------|---------|----------------|
| `extractStructure(cvText)` | Parse CV structure | OpenRouter → Gemini |
| `analyzeCV(cvText, jd)` | Full analysis | OpenRouter → Gemini |
| `scoreWithParsedData(data, jd)` | Score match | OpenRouter → Gemini |
| `rewriteResumeData(parsed, text, jd, analysis)` | Improve CV | OpenRouter → Gemini |
| `generateCoverLetter(cvText, jd)` | Create cover letter | OpenRouter → Gemini |

### APIKeyRotationService (`src/services/APIKeyRotationService.js`)

**Responsibilities:**
- Round-robin key distribution
- Circuit breaker for each key
- Health tracking and recovery
- Exponential backoff with jitter

**Key Configuration:**

```javascript
CIRCUIT_FAILURE_THRESHOLD = 5      // Open after 5 failures
CIRCUIT_RECOVERY_TIMEOUT_MS = 60000 // Try recovery after 60s
HALF_OPEN_TEST_REQUESTS = 2        // Need 2 successes to close
```

### CVExtractorService (`src/services/CVExtractorService.js`)

**Responsibilities:**
- Multi-format text extraction
- PDF parsing (pdf-parse)
- DOCX parsing (mammoth)
- Image OCR (Tesseract.js)

**Supported Formats:**

| Format | Extension | Library |
|--------|-----------|---------|
| PDF | `.pdf` | pdf-parse |
| Word | `.docx`, `.doc` | mammoth |
| PNG Image | `.png` | Tesseract.js |
| JPEG Image | `.jpg`, `.jpeg` | Tesseract.js |

---

## State Management

### Session State Machine

```
┌─────────────────────────────────────────────────────────────┐
│                    UserSession States                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  WAITING_CV ──────► WAITING_JD ──────► PROCESSING          │
│      ▲                  │                    │              │
│      │                  │                    ▼              │
│      │           (invalid JD)     WAITING_ACTION_CHOICE     │
│      │                  │                    │              │
│      │                  ▼                    ▼              │
│      └───────◄─────────◄────────────────────┘              │
│           (session end / /start)                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Session Data Structure

```javascript
{
  userId: "123456789",
  state: "WAITING_ACTION_CHOICE",
  cv: {
    bytes: Buffer,
    mimeType: "application/pdf",
    fileName: "resume.pdf",
    text: "Extracted CV text...",
    parsedData: { /* Structured data */ },
    resumeData: { /* Normalized resume */ }
  },
  jobDescription: "Job description text...",
  analysis: {
    score: 72,
    matchPercentage: 75,
    confidence: 85,
    scoreReason: "Good match with some gaps...",
    strengths: ["Strong technical skills"],
    weaknesses: ["Limited leadership experience"],
    improvementSuggestions: [...],
    missingKeywords: ["Docker", "Kubernetes"],
    // ... more fields
  },
  scoreSource: "openrouter_gemini",
  parserSource: "apilayer",
  createdAt: Date,
  updatedAt: Date
}
```

---

## File Structure

```
src/
├── app.js                          # Entry point
├── config/
│   └── index.js                    # Environment & API keys
├── controllers/
│   └── CVController.js             # Main business logic
├── models/
│   ├── index.js                    # Exports
│   └── UserSession.js              # Session state machine
├── services/
│   ├── AIService.js                # AI provider layer
│   ├── APIKeyRotationService.js    # Key rotation & circuit breaker
│   ├── APILayerService.js          # APILayer integration
│   ├── CVExtractorService.js       # File text extraction
│   ├── CVParserService.js          # CVParser integration
│   ├── UseResumeService.js         # UseResume integration
│   ├── DocumentGeneratorService.js # PDF/DOCX generation
│   ├── ResumeRendererService.js    # Resume document rendering
│   ├── ResumeTemplateService.js    # Resume data structures
│   └── WorkflowStoreService.js     # MongoDB persistence
├── utils/
│   └── index.js                    # Utility functions
├── views/
│   └── TelegramView.js             # Message formatting
└── prompts/
    └── resume-score-system-prompt.md  # AI scoring prompt
```
