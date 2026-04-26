import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import config from '../config/index.js';
import { apiKeyRotationService } from './APIKeyRotationService.js';
import { resumeTemplateService } from './ResumeTemplateService.js';

// AI API URLs
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RESUME_SCORE_SYSTEM_PROMPT_PATH = resolve(__dirname, '../prompts/resume-score-system-prompt.md');

export class AIService {
  constructor() {
    this.geminiKey = config.geminiApiKey;
    this.resumeScoreSystemPromptPromise = null;
  }

  async getResumeScoreSystemPrompt() {
    if (!this.resumeScoreSystemPromptPromise) {
      this.resumeScoreSystemPromptPromise = readFile(RESUME_SCORE_SYSTEM_PROMPT_PATH, 'utf8').catch((error) => {
        console.error('[AI] Failed to load resume score system prompt:', error.message);
        throw error;
      });
    }

    return this.resumeScoreSystemPromptPromise;
  }

  // ============ STRUCTURE EXTRACTION ============
  async extractStructure(cvText) {
    const prompt = `Analyze this CV and extract its STRUCTURE only (not content). Return a JSON with:
{
  "sections": ["list of section headers in order"],
  "formatting": {"hasBullets": boolean, "hasColumns": boolean, "hasIconsEmojis": boolean, "style": "modern|traditional|minimal"},
  "sectionStructure": {"Section Name": ["field1", "field2", ...]}
}
Return ONLY valid JSON. CV TEXT:\n${cvText.slice(0, 8000)}`;

    try {
      const result = await this.callOpenRouter(prompt);
      return this.parseJSON(result);
    } catch (e1) {
      console.log('[AI] OpenRouter failed for structure, trying Gemini:', e1.message);
      try {
        const result = await this.callGemini(prompt);
        return this.parseJSON(result);
      } catch (e2) {
        console.log('[AI] Gemini failed for structure');
        return { sections: [], formatting: {}, sectionStructure: {} };
      }
    }
  }

  // ============ CV ANALYSIS ============
  async analyzeCV(cvText, jobDescription) {
    const systemPrompt = await this.getResumeScoreSystemPrompt();
    const prompt = `Analyze the resume and job description below. Return ONLY valid JSON using the required scoring schema.

CV TEXT:\n${cvText.slice(0, 8000)}
JOB DESCRIPTION:\n${jobDescription.slice(0, 4000)}`;

    try {
      const result = await this.callOpenRouter(prompt, 4096, systemPrompt);
      return this.parseJSON(result) || this.getDefaultAnalysis();
    } catch (e1) {
      console.log('[AI] OpenRouter failed for analysis, trying Gemini:', e1.message);
      try {
        const result = await this.callGemini(prompt, { systemPrompt, responseMimeType: 'application/json' });
        return this.parseJSON(result) || this.getDefaultAnalysis();
      } catch (e2) {
        console.log('[AI] Gemini failed for analysis');
        return this.getDefaultAnalysis();
      }
    }
  }

  // ============ CV REWRITE ============
  async rewriteCV(cvText, jobDescription, structure, analysis) {
    const prompt = `You are an expert CV writer. Rewrite this CV to better match the job description by analyzing the FULL resume end-to-end.

CRITICAL RULES:
1. PRESERVE THE EXACT ORIGINAL STRUCTURE - same sections in same order
2. PRESERVE FORMATTING STYLE - keep bullets if there were bullets
3. Only improve content, not structure
4. Add missing keywords naturally
5. Do NOT add or recommend sections that already exist in the resume
6. Do NOT repeat content that is already present in the resume
7. Do NOT focus on a single section; review the full resume before rewriting
5. Return ONLY the CV content, no commentary

STRUCTURE:\n${JSON.stringify(structure)}
ANALYSIS:\n${JSON.stringify(analysis)}
ORIGINAL CV:\n${cvText.slice(0, 8000)}
JOB DESCRIPTION:\n${jobDescription.slice(0, 4000)}`;

    try {
      return await this.callOpenRouter(prompt);
    } catch (e1) {
      console.log('[AI] OpenRouter failed for rewrite, trying Gemini:', e1.message);
      try {
        return await this.callGemini(prompt);
      } catch (e2) {
        console.log('[AI] All AI providers failed for rewrite');
        throw new Error('Failed to rewrite CV with OpenRouter and Gemini');
      }
    }
  }

  // ============ COVER LETTER ============
  async generateCoverLetter(cvText, jobDescription) {
    const prompt = `You are an expert cover letter writer. Generate a professional cover letter based on this CV and job description.

Write a compelling cover letter that:
- Highlights relevant skills and experience
- Matches the job requirements
- Is professional and engaging
- Follows standard business letter format

CV TEXT:\n${cvText.slice(0, 6000)}
JOB DESCRIPTION:\n${jobDescription.slice(0, 3000)}`;

    try {
      return await this.callOpenRouter(prompt);
    } catch (e1) {
      console.log('[AI] OpenRouter failed for cover letter, trying Gemini:', e1.message);
      try {
        return await this.callGemini(prompt);
      } catch (e2) {
        console.log('[AI] All AI providers failed for cover letter');
        throw new Error('Failed to generate cover letter with OpenRouter and Gemini');
      }
    }
  }

  // ============ API CALLS ============

  async callGemini(prompt, options = {}) {
    if (!this.geminiKey) throw new Error('No Gemini API key');
    const { systemPrompt = null, responseMimeType = 'text/plain' } = options;

    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType },
    };

    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const response = await fetch(`${GEMINI_URL}?key=${this.geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error(`Gemini error: ${response.status}`);

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  async callOpenRouter(prompt, maxTokens = 4096, systemPrompt = null) {
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });
    return apiKeyRotationService.callWithRotation(config.openrouterModel, messages, maxTokens, 3);
  }

  // ============ HELPERS ============

  parseJSON(text) {
    if (!text) return null;
    try {
      // Try direct parse
      JSON.parse(text);
      return JSON.parse(text);
    } catch {
      // Try to extract JSON from text
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  getDefaultAnalysis() {
    return {
      score: 0,
      matchPercentage: 0,
      confidence: 0,
      scoreReason: '',
      keywordMatch: 0,
      contentQuality: 0,
      atsScore: 0,
      structureScore: 0,
      matchedRequirements: [],
      missingRequirements: [],
      criticalErrors: [],
      topFixes: [],
      missingKeywords: [],
      strengths: [],
      weaknesses: ['Could not analyze CV - all AI providers failed'],
      improvementSuggestions: [],
      sectionScores: {},
    };
  }

  async extractResumeDataWithOpenRouter(cvText) {
    const prompt = `Extract structured resume data from the CV text and return ONLY valid JSON using this schema:
{
  "profile": {
    "name": "",
    "summary": "",
    "email": "",
    "phone": "",
    "location": "",
    "url": "",
    "links": []
  },
  "workExperiences": [{"company": "", "jobTitle": "", "date": "", "descriptions": []}],
  "educations": [{"school": "", "degree": "", "gpa": "", "date": "", "descriptions": []}],
  "projects": [{"project": "", "date": "", "descriptions": []}],
  "skills": {
    "featuredSkills": [{"skill": "", "rating": 0}],
    "descriptions": []
  },
  "custom": {"descriptions": []},
  "raw_text": "",
  "full_text": ""
}

CV TEXT:\n${cvText.slice(0, 12000)}`;

    const parsed = await this.callJSONWithProviders(prompt, ['openrouter', 'gemini']);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('AI parser returned invalid resume object');
    }

    // Always persist complete extracted text for downstream full-CV scoring.
    if (!parsed.raw_text) parsed.raw_text = cvText;
    if (!parsed.full_text) parsed.full_text = cvText;

    return resumeTemplateService.buildResumeData(parsed, cvText);
  }

  async scoreWithOpenRouter(cvText, jobDescription) {
    const prompt = `Score this CV against the job description. Return ONLY valid JSON:
{
  "score": <0-100>,
  "matchPercentage": <0-100>,
  "missingKeywords": ["keyword1", "keyword2"]
}

CV TEXT:\n${cvText.slice(0, 10000)}
JOB DESCRIPTION:\n${jobDescription.slice(0, 5000)}`;

    const parsed = await this.callJSONWithProviders(prompt, ['openrouter', 'gemini']);

    if (!parsed || typeof parsed.score !== 'number') {
      throw new Error('AI providers did not return a valid score JSON');
    }

    return {
      score: Math.max(0, Math.min(100, Math.round(parsed.score))),
      matchPercentage: typeof parsed.matchPercentage === 'number'
        ? Math.max(0, Math.min(100, Math.round(parsed.matchPercentage)))
        : Math.max(0, Math.min(100, Math.round(parsed.score))),
      missingKeywords: Array.isArray(parsed.missingKeywords) ? parsed.missingKeywords : [],
    };
  }

  async suggestionsWithGemini(cvText, jobDescription) {
    const systemPrompt = await this.getResumeScoreSystemPrompt();
    const prompt = `Review the full resume end-to-end and return ONLY valid JSON with strengths, weaknesses, improvement suggestions, and section scores.

CV TEXT:\n${cvText.slice(0, 8000)}
JOB DESCRIPTION:\n${jobDescription.slice(0, 4000)}`;

    const parsed = await this.callJSONWithProviders(prompt, ['openrouter', 'gemini'], systemPrompt);

    if (!parsed) {
      throw new Error('AI providers did not return valid suggestions JSON');
    }

    return {
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
      improvementSuggestions: Array.isArray(parsed.improvementSuggestions) ? parsed.improvementSuggestions : [],
      sectionScores: parsed.sectionScores || {},
    };
  }

  async rewriteCVWithOpenRouter(cvText, jobDescription, structure, analysis) {
    return this.rewriteCV(cvText, jobDescription, structure, analysis);
  }

  async rewriteResumeData(parsedResume, cvText, jobDescription, analysis) {
    const baseResume = resumeTemplateService.buildResumeData(parsedResume, cvText);
    const prompt = `You are an expert resume writer. Improve the resume content to better match the job description.

Rules:
- Preserve the candidate's identity and factual background.
- Keep the same section set unless a section is completely empty.
- Rewrite into the default Open Resume-style template order:
  profile -> workExperiences -> educations -> projects -> skills -> custom.
- Improve wording, bullet quality, and keyword alignment using the suggestions below.
- Do not invent employers, degrees, dates, achievements, or skills that are not supported by the input.
- Preserve the resume as a single clean default template, not a custom layout.
- Return ONLY valid JSON using the exact schema below.

Schema:
{
  "profile": {
    "name": "",
    "summary": "",
    "email": "",
    "phone": "",
    "location": "",
    "url": "",
    "links": []
  },
  "workExperiences": [{"company": "", "jobTitle": "", "date": "", "descriptions": []}],
  "educations": [{"school": "", "degree": "", "gpa": "", "date": "", "descriptions": []}],
  "projects": [{"project": "", "date": "", "descriptions": []}],
  "skills": {
    "featuredSkills": [{"skill": "", "rating": 0}],
    "descriptions": []
  },
  "custom": {"descriptions": []}
}

Current structured resume:
${JSON.stringify(baseResume, null, 2)}

Analysis:
${JSON.stringify(analysis || {}, null, 2)}

Priority rewrite guidance:
- Apply the listed strengths, weaknesses, and improvementSuggestions where they match the relevant section.
- Keep bullets concise and action-oriented.
- Prefer quantified details only when they already exist in the source.
- If a section already reads well, keep it but polish the phrasing.

Original full resume text:
${cvText.slice(0, 10000)}

Job description:
${jobDescription.slice(0, 5000)}`;

    const parsed = await this.callJSONWithProviders(prompt, ['openrouter', 'gemini']);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('AI rewrite did not return valid structured resume JSON');
    }

    return resumeTemplateService.buildResumeData(parsed, cvText);
  }

  async generateCoverLetterWithOpenRouter(cvText, jobDescription) {
    return this.generateCoverLetter(cvText, jobDescription);
  }

  // Score resume against job description using parsed data
  async scoreWithParsedData(parsedResume, jobDescription) {
    const systemPrompt = await this.getResumeScoreSystemPrompt();
    const prompt = `Score the parsed resume against the job description and return ONLY valid JSON.

PARSED RESUME DATA:
${JSON.stringify(parsedResume, null, 2)}

JOB DESCRIPTION:
${jobDescription.slice(0, 5000)}`;

    try {
      const parsed = await this.callJSONWithProviders(prompt, ['openrouter', 'gemini'], systemPrompt);

      if (!parsed || typeof parsed.score !== 'number') {
        throw new Error('AI providers did not return a valid score JSON');
      }

      return {
        score: Math.max(0, Math.min(100, Math.round(parsed.score))),
        matchPercentage: typeof parsed.matchPercentage === 'number'
          ? Math.max(0, Math.min(100, Math.round(parsed.matchPercentage)))
          : Math.max(0, Math.min(100, Math.round(parsed.score))),
        confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.confidence))) : 0,
        scoreReason: typeof parsed.scoreReason === 'string' ? parsed.scoreReason : '',
        keywordMatch: typeof parsed.keywordMatch === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.keywordMatch))) : 0,
        contentQuality: typeof parsed.contentQuality === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.contentQuality))) : 0,
        atsScore: typeof parsed.atsScore === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.atsScore))) : 0,
        structureScore: typeof parsed.structureScore === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.structureScore))) : 0,
        matchedRequirements: Array.isArray(parsed.matchedRequirements) ? parsed.matchedRequirements : [],
        missingRequirements: Array.isArray(parsed.missingRequirements) ? parsed.missingRequirements : [],
        criticalErrors: Array.isArray(parsed.criticalErrors) ? parsed.criticalErrors : [],
        topFixes: Array.isArray(parsed.topFixes) ? parsed.topFixes : [],
        missingKeywords: Array.isArray(parsed.missingKeywords) ? parsed.missingKeywords : [],
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
        improvementSuggestions: Array.isArray(parsed.improvementSuggestions) ? parsed.improvementSuggestions : [],
        sectionScores: parsed.sectionScores || {},
      };
    } catch (e) {
      console.log('[AI] All AI scoring providers failed:', e.message);
      throw e;
    }
  }

  async callJSONWithProviders(prompt, providers = ['openrouter', 'gemini'], systemPrompt = null) {
    let lastError = null;

    for (const provider of providers) {
      try {
        console.log(`[AI] Trying ${provider} JSON response...`);
        const result = await this.callProvider(provider, prompt, 4096, systemPrompt);
        const parsed = this.parseJSON(result);
        if (parsed) return parsed;
        lastError = new Error(`${provider} returned invalid JSON`);
        console.log(`[AI] ${provider} returned invalid JSON`);
      } catch (error) {
        lastError = error;
        console.log(`[AI] ${provider} failed: ${error.message}`);
      }
    }

    throw new Error(`All AI providers failed. Last error: ${lastError?.message}`);
  }

  async callProvider(provider, prompt, maxTokens = 4096, systemPrompt = null) {
    if (provider === 'gemini') return this.callGemini(prompt, { systemPrompt });
    if (provider === 'openrouter') return this.callOpenRouter(prompt, maxTokens, systemPrompt);
    throw new Error(`Unknown AI provider: ${provider}`);
  }
}

export const aiService = new AIService();
