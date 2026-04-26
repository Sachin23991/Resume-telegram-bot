# Bot Workflow

This document describes the complete user journey through the CV Analyzer Telegram Bot, including all states, commands, and interactions.

## Table of Contents

- [Overview](#overview)
- [State Machine](#state-machine)
- [Command Reference](#command-reference)
- [User Journey](#user-journey)
- [Message Handlers](#message-handlers)
- [Callback Query Handlers](#callback-query-handlers)
- [Session Management](#session-management)

---

## Overview

The bot operates as a **state machine** where each user session progresses through defined states based on their actions:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Bot Workflow Overview                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  /start → Upload CV → Upload JD → View Analysis → Choose Action │
│           (WAITING_CV)  (WAITING_JD)  (PROCESSING)  (WAITING_ACTION)│
│                                                                 │
│  Actions Available:                                             │
│  - Generate Improved CV                                         │
│  - Generate Cover Letter                                        │
│  - Generate Both                                                │
│  - View Detailed Report                                         │
│  - Done (End Session)                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## State Machine

### States Definition

```javascript
// src/models/UserSession.js

export const UserState = {
  WAITING_CV: 'waiting_cv',              // Waiting for user to upload CV
  WAITING_JD: 'waiting_jd',              // Waiting for job description
  WAITING_ACTION_CHOICE: 'waiting_action_choice', // Analysis complete, waiting for action
  WAITING_FEEDBACK: 'waiting_feedback',  // (Reserved for future use)
  WAITING_CONFIRM: 'waiting_confirm',    // (Reserved for future use)
  PROCESSING: 'processing',              // AI analysis in progress
  COMPLETED: 'completed',                // Session completed
  ABANDONED: 'abandoned',                // Session abandoned
};
```

### State Transition Diagram

```
                                    ┌─────────────────┐
                                    │                 │
                                    ▼                 │
┌──────────────────────────────────────────────────────────────────┐
│                         STATE MACHINE                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│     ┌─────────────┐                                              │
│     │   INITIAL   │                                              │
│     └──────┬──────┘                                              │
│            │                                                     │
│            │ /start                                              │
│            ▼                                                     │
│     ┌─────────────┐                                              │
│     │ WAITING_CV  │◄─────────────────────────────────┐           │
│     │             │                                  │           │
│     │ • Accept CV │                                  │ /cancel   │
│     │ • Accept    │                                  │ /start    │
│     │   images    │                                  │           │
│     └──────┬──────┘                                  │           │
│            │                                         │           │
│            │ CV uploaded                             │           │
│            ▼                                         │           │
│     ┌─────────────┐                                  │           │
│     │ WAITING_JD  │◄─────────────────────┐           │           │
│     │             │                      │           │           │
│     │ • Accept JD │                      │ Invalid   │           │
│     │ • Accept    │                      │ JD        │           │
│     │   text      │                      │           │           │
│     └──────┬──────┘                      │           │           │
│            │                             │           │           │
│            │ JD received                 │           │           │
│            ▼                             │           │           │
│     ┌─────────────┐                      │           │           │
│     │ PROCESSING  │                      │           │           │
│     │             │                      │           │           │
│     │ • AI scoring│                      │           │           │
│     │ • Analysis  │                      │           │           │
│     │ • Suggestions                     │           │           │
│     └──────┬──────┘                      │           │           │
│            │                             │           │           │
│            │ Analysis complete           │           │           │
│            ▼                             │           │           │
│     ┌─────────────────┐                  │           │           │
│     │WAITING_ACTION_  │──────────────────┘           │           │
│     │    CHOICE       │                              │           │
│     │                 │                              │           │
│     │ • action_improve│                              │           │
│     │ • action_cover  │                              │           │
│     │ • action_both   │                              │           │
│     │ • action_report │                              │           │
│     │ • action_none   │                              │           │
│     └────────┬────────┘                              │           │
│              │                                       │           │
│              │ Action completed                      │           │
│              ▼                                       │           │
│     ┌─────────────┐                                  │           │
│     │  COMPLETED  │──────────────────────────────────┘           │
│     │             │                                              │
│     │ • Session   │                                              │
│     │   deleted   │                                              │
│     │ • History   │                                              │
│     │   saved     │                                              │
│     └─────────────┘                                              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Command Reference

### Bot Commands

| Command | Description | State Requirement | Handler |
|---------|-------------|-------------------|---------|
| `/start` | Begin new analysis session | Any | `cvController.handleStart()` |
| `/help` | Show help and supported formats | Any | `cvController.handleHelp()` |
| `/menu` | Show main menu with options | Any | `telegramView.menu()` |
| `/cancel` | Cancel current session | Any | `cvController.handleCancel()` |
| `/end` | End session gracefully | Active session | Inline handler |
| `/history` | Show past analyses | Any | Inline handler |
| `/stats` | Show user statistics | Any | Inline handler |
| `/info` | Show bot information | Any | Inline handler |

### Command Implementations

#### `/start` - Begin Session

```javascript
// src/app.js

bot.command('start', runHandler(async (ctx) => {
  await cvController.handleStart(ctx);
}));

// CVController.js
async handleStart(ctx) {
  const userId = ctx.from.id.toString();
  const session = UserSessionStore.create(userId);
  session.reset();
  await workflowStoreService.upsertStage(userId, 'start', { 
    state: UserState.WAITING_CV 
  });
  await telegramView.welcome(ctx);
  return UserState.WAITING_CV;
}
```

#### `/help` - Show Help

```
📚 CV Analyzer Bot - Help

Supported CV Formats:
• PDF Documents (.pdf)
• Word Documents (.docx, .doc)
• Images (.png, .jpg, .jpeg) - OCR enabled

Supported JD Formats:
• Paste text directly
• PDF Documents
• Word Documents
• Images

Commands:
/start - Begin new analysis
/menu - Show main menu
/cancel - Cancel current session
/history - View past analyses
/stats - Your statistics
/end - End session

Tips:
• Send high-quality PDFs for best parsing
• Include full job description for accurate scoring
• Use action buttons after analysis for best results
```

#### `/menu` - Main Menu

```
┌─────────────────────────────────────┐
│      CV Analyzer Pro - Menu         │
├─────────────────────────────────────┤
│                                     │
│ 📊 Analyze CV                       │
│    Score your resume against a JD   │
│                                     │
│ 📜 View History                     │
│    See your past analyses           │
│                                     │
│ 📈 Statistics                       │
│    Your usage statistics            │
│                                     │
│ ℹ️  Bot Info                        │
│    Features and version             │
│                                     │
│ [Start Analysis] [History] [Stats] │
└─────────────────────────────────────┘
```

---

## User Journey

### Complete Flow Example

```
┌─────────────────────────────────────────────────────────────────┐
│                    Complete User Journey                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. USER: /start                                                │
│                                                                 │
│     BOT: 👋 Welcome to CV Analyzer Bot!                         │
│          I help you analyze, score, and improve your resume.    │
│                                                                 │
│          📊 Score your CV match (0-100)                         │
│          🔍 Find missing keywords                               │
│          💡 Suggest improvements                                │
│          ✨ Create improved resume                              │
│          📝 Generate cover letter                               │
│                                                                 │
│          To get started, send me your CV!                       │
│                                                                 │
│  2. USER: [Uploads resume.pdf]                                  │
│                                                                 │
│     BOT: 📄 Extracting CV content...                            │
│          📋 Parsing full CV...                                  │
│          ✅ CV Received!                                        │
│                                                                 │
│          Now send me the job description.                       │
│          You can send:                                          │
│          • Paste text directly                                  │
│          • Send a PDF file                                      │
│          • Send a Word document (.docx)                         │
│                                                                 │
│  3. USER: [Pastes job description text]                         │
│                                                                 │
│     BOT: ⏳ Analyzing your CV...                                │
│                                                                 │
│          [30 seconds later]                                     │
│                                                                 │
│     📊 Analysis Results                                         │
│                                                                 │
│     Match Score: 72/100 (🤖 AI Analysis)                        │
│     📊 Decent match. Some improvements could help.              │
│                                                                 │
│     ✅ Strengths:                                               │
│     • Strong technical background                               │
│     • Relevant certifications                                   │
│                                                                 │
│     ❌ Missing Keywords:                                        │
│     React Native, Docker, CI/CD, Agile                          │
│                                                                 │
│     💡 Key Improvements:                                        │
│     1. [Experience] Add quantified achievements                 │
│     2. [Skills] Include Docker and Kubernetes                   │
│     3. [Summary] Tailor to job requirements                     │
│                                                                 │
│     What would you like me to do?                               │
│     [Improve CV] [Cover Letter] [Both] [Report] [Done]          │
│                                                                 │
│  4a. USER: [Clicks "Improve CV"]                                │
│                                                                 │
│     BOT: 📄 Generating document in original format...           │
│          [Send: improved_resume.pdf]                            │
│                                                                 │
│          ✅ Done! Your improved CV is ready.                    │
│          Send /start for a new analysis.                        │
│                                                                 │
│  4b. USER: [Clicks "Cover Letter"]                              │
│                                                                 │
│     BOT: 📝 Generating cover letter...                          │
│          [Send: cover_letter.pdf]                               │
│                                                                 │
│          ✅ Done! Your cover letter is ready.                   │
│          Send /start for a new analysis.                        │
│                                                                 │
│  4c. USER: [Clicks "Both"]                                      │
│                                                                 │
│     BOT: 📄 Generating documents...                             │
│          [Send: improved_resume.pdf]                            │
│          [Send: cover_letter.pdf]                               │
│                                                                 │
│          ✅ Done! Both documents are ready.                     │
│          Send /start for a new analysis.                        │
│                                                                 │
│  4d. USER: [Clicks "Report"]                                    │
│                                                                 │
│     BOT: 📊 Generating detailed report...                       │
│          [Shows detailed analysis with all scores]              │
│                                                                 │
│  4e. USER: [Clicks "Done"]                                      │
│                                                                 │
│     BOT: ✅ Session complete!                                   │
│          Send /start for a new analysis.                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Message Handlers

### Document Handler

```javascript
// src/app.js

bot.on('document', runHandler(async (ctx) => {
  const state = cvController.getState(ctx.from.id.toString());
  
  if (state === UserState.WAITING_CV) {
    await cvController.handleCV(ctx);
  } else if (state === UserState.WAITING_JD) {
    await cvController.handleJobDescription(ctx);
  } else if (state === UserState.PROCESSING) {
    await ctx.reply('⏳ Still processing your previous request. Please wait...');
  } else if (state === UserState.WAITING_ACTION_CHOICE) {
    await ctx.reply('Please choose an option from the buttons above.');
  } else {
    await ctx.reply('Session ended. Use /start to begin a new analysis.');
  }
}));
```

### Photo Handler (OCR)

```javascript
bot.on('photo', runHandler(async (ctx) => {
  const state = cvController.getState(ctx.from.id.toString());
  
  if (state === UserState.WAITING_CV || state === UserState.WAITING_JD) {
    // Get the highest resolution photo
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    // Process as image with OCR
    if (state === UserState.WAITING_CV) {
      await cvController.handleCV(ctx);
    } else {
      await cvController.handleJobDescription(ctx);
    }
  }
  // ... similar state handling
}));
```

### Text Handler

```javascript
bot.on('text', runHandler(async (ctx) => {
  const state = cvController.getState(ctx.from.id.toString());
  const text = ctx.message.text?.toLowerCase() || '';

  // Check for menu triggers
  if (text === 'menu' || text === '/menu') {
    await telegramView.menu(ctx);
    return;
  }

  // State-based handling
  if (state === UserState.WAITING_JD) {
    await cvController.handleJobDescription(ctx);
  } else if (state === UserState.WAITING_CV) {
    await ctx.reply('👋 Please send your CV to begin!');
  } else if (state === UserState.PROCESSING) {
    await ctx.reply('⏳ Please wait while processing...');
  } else if (state === UserState.WAITING_ACTION_CHOICE) {
    await ctx.reply('Please select an option from the buttons.');
  } else {
    await ctx.reply('Session ended. Use /start to begin.');
  }
}));
```

---

## Callback Query Handlers

### Action Choice Handler

```javascript
// src/app.js

bot.on('callback_query', runHandler(async (ctx) => {
  await cvController.handleActionChoice(ctx);
}));

// CVController.js
async handleActionChoice(ctx) {
  const userId = ctx.from.id.toString();
  const session = UserSessionStore.get(userId);

  if (!session) {
    await telegramView.sessionExpired(ctx);
    return UserState.WAITING_CV;
  }

  const choice = ctx.callbackQuery?.data;
  
  // Acknowledge the callback
  try {
    await ctx.telegram.answerCbQuery(ctx.callbackQuery?.id);
  } catch (ackError) {
    console.log('Failed to acknowledge callback');
  }

  if (choice === 'action_none') {
    await telegramView.done(ctx);
    UserSessionStore.delete(userId);
    return UserState.WAITING_CV;
  }

  if (!['action_improve', 'action_cover', 'action_both', 'action_report'].includes(choice)) {
    return UserState.WAITING_ACTION_CHOICE;
  }

  const { cv, jobDescription, analysis } = session;

  try {
    if (choice === 'action_improve') {
      await this.handleImproveResume(ctx, cv.bytes, jobDescription, analysis, session);
    } else if (choice === 'action_cover') {
      await this.handleGenerateCoverLetter(ctx, cv.bytes, jobDescription, session);
    } else if (choice === 'action_both') {
      await this.handleGenerateBoth(ctx, cv.bytes, jobDescription, analysis, session);
    } else if (choice === 'action_report') {
      await this.handleDetailedReport(ctx, analysis, session);
    }
  } catch (error) {
    await telegramView.actionError(ctx, error.message);
  }

  UserSessionStore.delete(userId);
  return UserState.WAITING_CV;
}
```

### Action Buttons

```
After analysis, user sees:

┌─────────────────────────────────────────┐
│  What would you like to do?             │
├─────────────────────────────────────────┤
│                                         │
│  [✨ Improve CV]                        │
│  [📝 Cover Letter]                      │
│  [📦 Both]                              │
│  [📊 Report]                            │
│  [✅ Done]                              │
│                                         │
└─────────────────────────────────────────┘

Callback data:
- action_improve
- action_cover
- action_both
- action_report
- action_none
```

---

## Session Management

### Session Store

```javascript
// src/models/UserSession.js

const sessions = new Map();
const sessionHistory = new Map();

export const UserSessionStore = {
  get(userId) {
    const session = sessions.get(userId);
    // Check for stale session (1 hour timeout)
    if (session && session.isStale()) {
      sessions.delete(userId);
      return null;
    }
    return session;
  },

  create(userId) {
    if (!sessions.has(userId)) {
      sessions.set(userId, new UserSession(userId));
      sessionHistory.set(userId, new SessionHistory(userId));
    }
    return sessions.get(userId);
  },

  update(userId, session) {
    sessions.set(userId, session);
  },

  delete(userId) {
    const session = sessions.get(userId);
    if (session) {
      // Save to history before deleting
      const history = sessionHistory.get(userId);
      if (history && session.analysis) {
        history.addCompletedSession(session.getSummary());
      }
      sessions.delete(userId);
    }
  },

  getHistory(userId) {
    const history = sessionHistory.get(userId);
    return history ? history.getHistory() : [];
  },

  getStats(userId) {
    const history = sessionHistory.get(userId);
    return history ? history.getStats() : { 
      totalAnalyzed: 0, 
      lastActivity: null 
    };
  },
};
```

### Session Expiry

Sessions expire after **1 hour** of inactivity:

```javascript
isStale(maxAgeMs = 3600000) { // 1 hour default
  return Date.now() - this.updatedAt > maxAgeMs;
}
```

When a session expires:
- User is notified: "Session expired. Please send /start to begin again."
- Session data is cleaned up
- Summary is saved to history (if analysis was complete)

### MongoDB Persistence (Workflow Store)

```javascript
// src/services/WorkflowStoreService.js

async upsertStage(userId, stage, metadata) {
  await collection.updateOne(
    { userId },
    {
      $set: {
        userId,
        stage,
        metadata,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );
}
```

This provides:
- Analytics tracking
- Debug capabilities
- Session recovery (future feature)

---

## Error Handling

### User-Facing Error Messages

| Error Type | User Message | Bot Action |
|------------|--------------|------------|
| Invalid file type | "Please send a PDF, Word document, or image" | Stay in current state |
| Text extraction failed | "Failed to extract content. Please try another file" | Stay in current state |
| AI analysis failed | "Analysis failed. Please try again or send /start" | Return to WAITING_JD |
| Session expired | "Session expired. Send /start to begin again" | Clean up session |
| API rate limited | "Processing... Please wait" (with delay) | Retry with backoff |
| Document generation failed | "Failed to generate document. Please try again" | Offer retry |

### Graceful Degradation

When services fail, the bot degrades gracefully:

```
AI Analysis Failed:
├─ Try OpenRouter → Failed
├─ Try Gemini → Failed
└─ Use default score (50/100) + inform user

Parser Failed:
├─ Try APILayer → Failed
├─ Try CVParser → Failed
├─ Try UseResume → Failed
├─ Try AI Extraction → Failed
└─ Use raw text only + continue with scoring
```
