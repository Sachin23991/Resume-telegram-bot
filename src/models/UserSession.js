// User session states - Comprehensive state machine
export const UserState = {
  WAITING_CV: 'waiting_cv',
  WAITING_JD: 'waiting_jd',
  WAITING_ACTION_CHOICE: 'waiting_action_choice',
  WAITING_FEEDBACK: 'waiting_feedback',
  WAITING_CONFIRM: 'waiting_confirm',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
};

// Session history for tracking
export class SessionHistory {
  constructor(userId) {
    this.userId = userId;
    this.sessions = []; // List of completed session summaries
    this.totalAnalyzed = 0;
    this.lastActivity = new Date();
  }

  addCompletedSession(summary) {
    this.sessions.push({
      ...summary,
      completedAt: new Date(),
    });
    this.totalAnalyzed += 1;
    this.lastActivity = new Date();
    // Keep only last 10 sessions
    if (this.sessions.length > 10) {
      this.sessions.shift();
    }
  }

  getHistory() {
    return this.sessions.slice(-5).reverse(); // Last 5 sessions, newest first
  }

  getStats() {
    return {
      totalAnalyzed: this.totalAnalyzed,
      lastActivity: this.lastActivity,
      recentSessions: this.sessions.length,
    };
  }
}

// User session model with enhanced features
export class UserSession {
  constructor(userId) {
    this.userId = userId;
    this.state = UserState.WAITING_CV;
    this.cv = null;        // { bytes, mimeType, fileName, text, structure, parsedData, resumeData }
    this.jobDescription = null;
    this.analysis = null;  // AI analysis results
    this.apiScore = null;  // Official API score
    this.scoreSource = null; // Which provider gave the score
    this.parserSource = null; // Which parser was used
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.language = 'English';
    this.industry = null; // Target industry for scoring
    this.metadata = {
      startedAt: new Date(),
      lastAction: null,
      retryCount: 0,
      apiCallsMade: [],
    };
  }

  setCV(cvData) {
    this.cv = cvData;
    this.updatedAt = new Date();
    this.metadata.lastAction = 'cv_received';
  }

  setJobDescription(jd) {
    this.jobDescription = jd;
    this.updatedAt = new Date();
    this.metadata.lastAction = 'jd_received';
  }

  setAnalysis(analysis) {
    this.analysis = analysis;
    this.updatedAt = new Date();
    this.metadata.lastAction = 'analysis_complete';
  }

  setApiScore(score, source = 'api') {
    this.apiScore = score;
    this.scoreSource = source;
    this.updatedAt = new Date();
  }

  setState(state) {
    this.state = state;
    this.updatedAt = new Date();
    this.metadata.lastAction = `state_${state}`;
  }

  setLanguage(lang) {
    this.language = lang;
  }

  setIndustry(industry) {
    this.industry = industry;
  }

  incrementRetry() {
    this.metadata.retryCount += 1;
  }

  addApiCall(provider, success, responseTime) {
    this.metadata.apiCallsMade.push({
      provider,
      success,
      responseTime,
      timestamp: new Date(),
    });
  }

  getSummary() {
    return {
      score: this.analysis?.score || this.apiScore || 0,
      jobDescription: this.jobDescription?.slice(0, 100) || 'N/A',
      parserSource: this.parserSource,
      scoreSource: this.scoreSource,
      completedAt: new Date(),
    };
  }

  reset() {
    const previousSession = this.metadata.totalAnalyzed || 0;
    this.state = UserState.WAITING_CV;
    this.cv = null;
    this.jobDescription = null;
    this.analysis = null;
    this.apiScore = null;
    this.scoreSource = null;
    this.parserSource = null;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.language = 'English';
    this.industry = null;
    this.metadata = {
      startedAt: new Date(),
      lastAction: null,
      retryCount: 0,
      apiCallsMade: [],
    };
  }

  isStale(maxAgeMs = 3600000) { // 1 hour default
    return Date.now() - this.updatedAt > maxAgeMs;
  }
}

// In-memory store with history tracking (replace with Redis/DB for production)
const sessions = new Map();
const sessionHistory = new Map(); // Track completed sessions per user

export const UserSessionStore = {
  get(userId) {
    const session = sessions.get(userId);
    // Check for stale session and clean up
    if (session && session.isStale()) {
      console.log(`[UserSession] Session for ${userId} has expired, cleaning up`);
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

  // Get user's session history
  getHistory(userId) {
    const history = sessionHistory.get(userId);
    return history ? history.getHistory() : [];
  },

  // Get user stats
  getStats(userId) {
    const history = sessionHistory.get(userId);
    return history ? history.getStats() : { totalAnalyzed: 0, lastActivity: null, recentSessions: 0 };
  },

  // Get all active sessions count
  getActiveCount() {
    return sessions.size;
  },
};
