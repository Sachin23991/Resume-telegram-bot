// User session states
export const UserState = {
  WAITING_CV: 'waiting_cv',
  WAITING_JD: 'waiting_jd',
  WAITING_ACTION_CHOICE: 'waiting_action_choice',
  PROCESSING: 'processing',
};

// User session model
export class UserSession {
  constructor(userId) {
    this.userId = userId;
    this.state = UserState.WAITING_CV;
    this.cv = null;        // { bytes, mimeType, fileName, text, structure, parsedData, resumeData }
    this.jobDescription = null;
    this.analysis = null;  // AI analysis results
    this.apiScore = null;  // Official API score
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  setCV(cvData) {
    this.cv = cvData;
    this.updatedAt = new Date();
  }

  setJobDescription(jd) {
    this.jobDescription = jd;
    this.updatedAt = new Date();
  }

  setAnalysis(analysis) {
    this.analysis = analysis;
    this.updatedAt = new Date();
  }

  setApiScore(score) {
    this.apiScore = score;
    this.updatedAt = new Date();
  }

  setState(state) {
    this.state = state;
    this.updatedAt = new Date();
  }

  reset() {
    this.state = UserState.WAITING_CV;
    this.cv = null;
    this.jobDescription = null;
    this.analysis = null;
    this.apiScore = null;
    this.updatedAt = new Date();
  }
}

// In-memory store (replace with Redis/DB for production)
const sessions = new Map();

export const UserSessionStore = {
  get(userId) {
    return sessions.get(userId);
  },

  create(userId) {
    if (!sessions.has(userId)) {
      sessions.set(userId, new UserSession(userId));
    }
    return sessions.get(userId);
  },

  update(userId, session) {
    sessions.set(userId, session);
  },

  delete(userId) {
    sessions.delete(userId);
  },
};
