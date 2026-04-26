# Scoring Mechanism

This document explains in detail how the CV Analyzer Bot calculates match scores between resumes and job descriptions.

## Table of Contents

- [Overview](#overview)
- [Scoring Pipeline](#scoring-pipeline)
- [Score Components](#score-components)
- [ATS Weight Breakdown](#ats-weight-breakdown)
- [Confidence Calculation](#confidence-calculation)
- [AI Prompt System](#ai-prompt-system)
- [Score Interpretation](#score-interpretation)

---

## Overview

The scoring system uses **AI-powered analysis** with a multi-dimensional approach:

```
┌──────────────────────────────────────────────────────────────┐
│                    Scoring Architecture                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Input: Full CV Text + Parsed Structure + Job Description   │
│                            │                                 │
│                            ▼                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           AI Scoring Engine (OpenRouter/Gemini)       │   │
│  │                                                       │   │
│  │  Analyzes 7 weighted dimensions:                      │   │
│  │  1. Work Experience Match (30%)                       │   │
│  │  2. Skills & Keywords (20%)                           │   │
│  │  3. Formatting / Parsing (15%)                        │   │
│  │  4. Contact Info Completeness (10%)                   │   │
│  │  5. Summary Quality (10%)                             │   │
│  │  6. Education Relevance (10%)                         │   │
│  │  7. Language Quality (5%)                             │   │
│  └──────────────────────────────────────────────────────┘   │
│                            │                                 │
│                            ▼                                 │
│  Output: { score, matchPercentage, confidence, ... }        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Scoring Pipeline

### Step 1: Data Preparation

Before scoring, the system prepares the input data:

```javascript
// From CVController.js:handleJobDescription()

const scoringResumeData =
  session.cv.resumeData ||
  resumeTemplateService.buildResumeData(
    session.cv.parsedData || {},
    session.cv.text || ''
  );

// Full text is ALWAYS used for scoring (not just sections)
const scorePayload = `${session.cv.text}\n\n[PARSED_FULL_CV_CONTEXT]\n${JSON.stringify(scoringResumeData, null, 2)}`;
```

### Step 2: AI Provider Selection

```
┌─────────────────────────────────────────────┐
│          AI Provider Fallback Chain         │
├─────────────────────────────────────────────┤
│                                             │
│  1️⃣ OpenRouter (GPT-4o-mini) - PRIMARY    │
│     │                                       │
│     ▼ (on failure)                          │
│  2️⃣ Gemini (gemini-2.5-flash) - SECONDARY │
│     │                                       │
│     ▼ (on failure)                          │
│  3️⃣ Default Score (50) - FALLBACK         │
│                                             │
└─────────────────────────────────────────────┘
```

### Step 3: Score Calculation

The AI receives a structured prompt and returns JSON:

```json
{
  "score": 72,
  "matchPercentage": 75,
  "confidence": 85,
  "scoreReason": "Strong technical background with relevant experience...",
  "keywordMatch": 80,
  "contentQuality": 70,
  "atsScore": 90,
  "structureScore": 65,
  "matchedRequirements": ["5+ years experience", "React expertise"],
  "missingRequirements": ["Kubernetes", "CI/CD pipelines"],
  "criticalErrors": [],
  "topFixes": ["Add DevOps experience", "Include quantified achievements"],
  "missingKeywords": ["Docker", "Kubernetes", "Agile"],
  "strengths": ["Strong technical skills", "Relevant certifications"],
  "weaknesses": ["Limited leadership examples"],
  "improvementSuggestions": [...]
}
```

---

## Score Components

### Primary Score Fields

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `score` | number | 0-100 | Overall match score |
| `matchPercentage` | number | 0-100 | Keyword/skill match % |
| `confidence` | number | 0-100 | AI confidence in assessment |
| `scoreReason` | string | - | Human-readable explanation |

### Dimension Scores

| Field | Weight | Description |
|-------|--------|-------------|
| `keywordMatch` | 20% | Skills and keywords from JD |
| `contentQuality` | 25% | Writing quality and clarity |
| `atsScore` | 15% | ATS compatibility |
| `structureScore` | 10% | Resume organization |
| (implicit) Work Experience | 30% | Role relevance and depth |

### Analysis Arrays

| Field | Type | Purpose |
|-------|------|---------|
| `matchedRequirements` | string[] | JD requirements met |
| `missingRequirements` | string[] | JD requirements not found |
| `criticalErrors` | string[] | Deal-breaker issues |
| `topFixes` | string[] | Priority improvements |
| `missingKeywords` | string[] | Keywords to add |
| `strengths` | string[] | Candidate strengths |
| `weaknesses` | string[] | Areas for improvement |
| `improvementSuggestions` | object[] | Specific actionable suggestions |

---

## ATS Weight Breakdown

The ATS (Applicant Tracking System) compatibility score is calculated based on:

```
┌─────────────────────────────────────────────────────────────┐
│              ATS Weight Distribution                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Work Experience ............................ 30%        │
│     - Years of experience                                   │
│     - Role progression                                      │
│     - Relevant job titles                                   │
│     - Company prestige (implicit)                           │
│                                                             │
│  2. Skills & Keywords ........................... 20%       │
│     - Hard skills match                                     │
│     - Technical keywords                                    │
│     - Industry terminology                                  │
│     - Tool/technology mentions                              │
│                                                             │
│  3. Formatting / Parsing ........................ 15%       │
│     - Clean structure                                       │
│     - Standard section headers                              │
│     - No complex tables/graphics                            │
│     - Machine-readable format                               │
│                                                             │
│  4. Contact Info ................................. 10%      │
│     - Email present                                         │
│     - Phone number present                                  │
│     - Location included                                     │
│     - LinkedIn/profile links                                │
│                                                             │
│  5. Summary / Objective .......................... 10%      │
│     - Clear career objective                                │
│     - Tailored to role                                      │
│     - Highlights key strengths                              │
│                                                             │
│  6. Education ................................. 10%         │
│     - Degree relevance                                      │
│     - Institution quality                                   │
│     - Certifications                                        │
│     - GPA (if included)                                     │
│                                                             │
│  7. Language Quality ............................. 5%       │
│     - Grammar and spelling                                  │
│     - Professional tone                                     │
│     - Action verb usage                                     │
│     - Concise writing                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Confidence Calculation

Confidence score indicates how reliable the AI assessment is:

### High Confidence (80-100)
- Clear, well-structured CV
- Complete information in all sections
- Obvious skill/JD alignment
- No ambiguous content

### Medium Confidence (50-79)
- Some missing sections
- Moderate structure quality
- Partial skill match
- Some ambiguous content

### Low Confidence (0-49)
- Poorly structured CV
- Missing critical sections
- Unclear career narrative
- Heavily designed/graphics-heavy PDF

### Programmatic Confidence Adjustment

```javascript
// From AIService.js - scoreWithParsedData()

return {
  score: Math.max(0, Math.min(100, Math.round(parsed.score))),
  matchPercentage: typeof parsed.matchPercentage === 'number'
    ? Math.max(0, Math.min(100, Math.round(parsed.matchPercentage)))
    : Math.max(0, Math.min(100, Math.round(parsed.score))),
  confidence: typeof parsed.confidence === 'number'
    ? Math.max(0, Math.min(100, Math.round(parsed.confidence)))
    : 0,
  // ... other fields
};
```

---

## AI Prompt System

### System Prompt Location

The scoring prompt is stored in:
```
src/prompts/resume-score-system-prompt.md
```

### Prompt Structure

The system prompt instructs the AI to:

1. **Parse the resume structure** - Identify sections and content
2. **Extract keywords** - Find skills, tools, technologies
3. **Compare against JD** - Match requirements
4. **Score each dimension** - Apply weighted scoring
5. **Generate actionable feedback** - Provide specific suggestions

### User Prompt Format

```
PARSED RESUME DATA:
{
  "profile": { ... },
  "workExperiences": [ ... ],
  "educations": [ ... ],
  "skills": { ... },
  "projects": [ ... ],
  "raw_text": "...",
  "full_text": "..."
}

JOB DESCRIPTION:
{Job description text}
```

### Expected Response Schema

```json
{
  "score": <number 0-100>,
  "matchPercentage": <number 0-100>,
  "confidence": <number 0-100>,
  "scoreReason": "<string explaining the score>",
  "keywordMatch": <number 0-100>,
  "contentQuality": <number 0-100>,
  "atsScore": <number 0-100>,
  "structureScore": <number 0-100>,
  "matchedRequirements": ["<string>", ...],
  "missingRequirements": ["<string>", ...],
  "criticalErrors": ["<string>", ...],
  "topFixes": ["<string>", ...],
  "missingKeywords": ["<string>", ...],
  "strengths": ["<string>", ...],
  "weaknesses": ["<string>", ...],
  "improvementSuggestions": [
    {
      "section": "<string>",
      "suggested": "<string>",
      "change": "<string>"
    }
  ],
  "sectionScores": {
    "<section_name>": <number 0-100>
  }
}
```

---

## Score Interpretation

### Score Ranges

| Score | Label | Description |
|-------|-------|-------------|
| 90-100 | 🟢 Excellent | Exceptional match, minor tweaks only |
| 75-89 | 🟡 Good | Strong candidate, some improvements needed |
| 60-74 | 🟠 Decent | Reasonable match, notable gaps exist |
| 40-59 | 🔴 Weak | Significant gaps, major improvements needed |
| 0-39 | ⚫ Poor | Fundamental mismatch or poor CV quality |

### Confidence + Score Matrix

```
                    Confidence
              Low      Medium     High
         ┌─────────┬─────────┬─────────┐
    High │ Good    │ Good    │ Excellent│
         │ but     │ match,  │ match,  │
         │ verify  │ reliable│ reliable│
         ├─────────┼─────────┼─────────┤
Score  Med│ Unclear │ Decent  │ Solid   │
         │ signal  │ match,  │ match   │
         │         │ some    │         │
         │         │ doubt   │         │
         ├─────────┼─────────┼─────────┤
    Low  │ Poor    │ Weak    │ Clear   │
         │ data    │ match,  │ mismatch│
         │ quality │ needs   │         │
         │         │ work    │         │
         └─────────┴─────────┴─────────┘
```

### Action Recommendations by Score

| Score Range | Recommended Action |
|-------------|-------------------|
| 90-100 | Apply immediately, minor keyword tweaks |
| 75-89 | Apply with suggested improvements |
| 60-74 | Improve CV before applying |
| 40-59 | Significant rewrite recommended |
| 0-39 | Consider different roles or complete rewrite |

---

## Fallback Scoring

When all AI providers fail, a default score is used:

```javascript
// From CVController.js

} catch (aiScoreError) {
  console.log('[CVController] AI scoring failed, using default score fallback');
  analysis.score = 50;
  analysis.matchPercentage = 50;
  scoreSource = 'default';
}
```

**Default Score: 50/100**
- Neutral midpoint
- Indicates "unknown match quality"
- User informed that AI analysis was unavailable

---

## Score Source Tracking

The system tracks which provider generated the score:

```javascript
analysis.scoreSource = scoreSource;  // 'openrouter_gemini', 'default', etc.
analysis.suggestionSource = suggestionSource;
analysis.apiScoreUsed = false;
```

This is logged to MongoDB for analytics and debugging.
