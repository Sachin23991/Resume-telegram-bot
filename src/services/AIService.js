import config from '../config/index.js';
import { apiKeyRotationService } from './APIKeyRotationService.js';
import { resumeTemplateService } from './ResumeTemplateService.js';

// AI API URLs
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export class AIService {
  constructor() {
    this.geminiKey = config.geminiApiKey;
    this.openaiKey = config.openaiApiKey;
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
    const prompt = `You are an expert HR recruiter. Analyze this CV against the job description.

Return ONLY valid JSON:
{
  "score": <0-100>,
  "matchPercentage": <0-100>,
  "missingKeywords": ["keyword1", ...],
  "strengths": ["strength1", ...],
  "weaknesses": ["weakness1", ...],
  "improvementSuggestions": [{"section": "...", "current": "...", "suggested": "...", "reason": "..."}],
  "sectionScores": {"Section Name": {"score": 0-100, "notes": "..."}}
}

CV TEXT:\n${cvText.slice(0, 8000)}
JOB DESCRIPTION:\n${jobDescription.slice(0, 4000)}`;

    try {
      const result = await this.callOpenRouter(prompt);
      return this.parseJSON(result) || this.getDefaultAnalysis();
    } catch (e1) {
      console.log('[AI] OpenRouter failed for analysis, trying Gemini:', e1.message);
      try {
        const result = await this.callGemini(prompt);
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

  async callGemini(prompt) {
    if (!this.geminiKey) throw new Error('No Gemini API key');

    const response = await fetch(`${GEMINI_URL}?key=${this.geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'text/plain' },
      }),
    });

    if (!response.ok) throw new Error(`Gemini error: ${response.status}`);

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  async callOpenRouter(prompt, maxTokens = 4096) {
    const messages = [{ role: 'user', content: prompt }];
    return apiKeyRotationService.callWithRotation('openai/gpt-4o-mini', messages, maxTokens, 3);
  }

  async callOpenAI(prompt, maxTokens = 4096) {
    if (!config.openaiEnabled || !this.openaiKey) {
      throw new Error('OpenAI provider disabled or key not configured');
    }

    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      let message = '';
      try {
        const error = await response.json();
        message = error.error?.message || JSON.stringify(error);
      } catch {
        message = await response.text();
      }
      throw new Error(`OpenAI error: ${response.status} ${message.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from OpenAI');
    return content;
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
    const prompt = `You are an expert HR recruiter. Analyze the FULL resume end-to-end and return resume IMPROVEMENT SUGGESTIONS only.

  Important:
  - Do not suggest sections that already exist in the resume.
  - Do not repeat strengths or content that is already present.
  - Do not focus on a single section; review the entire resume before making suggestions.
  - Only suggest missing or weak areas that are relevant to the job description.

Return ONLY valid JSON:
{
  "strengths": ["strength1", ...],
  "weaknesses": ["weakness1", ...],
  "improvementSuggestions": [{"section": "...", "current": "...", "suggested": "...", "reason": "..."}],
  "sectionScores": {"Section Name": {"score": 0-100, "notes": "..."}}
}

CV TEXT:\n${cvText.slice(0, 8000)}
JOB DESCRIPTION:\n${jobDescription.slice(0, 4000)}`;

    const parsed = await this.callJSONWithProviders(prompt, ['openrouter', 'gemini']);

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

  async rewriteCVWithOpenAI(cvText, jobDescription, structure, analysis) {
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

  async generateCoverLetterWithOpenAI(cvText, jobDescription) {
    return this.generateCoverLetter(cvText, jobDescription);
  }

  // Score resume against job description using parsed data
  async scoreWithParsedData(parsedResume, jobDescription) {
    const prompt = `You are an expert HR recruiter. Score this FULL parsed resume against the job description.

Important:
- Evaluate the entire resume, not one section.
- Do not suggest adding sections that already exist.
- If a skill or detail already exists anywhere in the resume, do not count it as missing.

Return ONLY valid JSON:
{
  "score": <0-100>,
  "matchPercentage": <0-100>,
  "missingKeywords": ["keyword1", "keyword2"],
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"],
  "improvementSuggestions": [{"section": "...", "suggested": "...", "reason": "..."}]
}

PARSED RESUME DATA:
${JSON.stringify(parsedResume, null, 2)}

JOB DESCRIPTION:
${jobDescription.slice(0, 5000)}`;

    try {
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
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
        improvementSuggestions: Array.isArray(parsed.improvementSuggestions) ? parsed.improvementSuggestions : [],
      };
    } catch (e) {
      console.log('[AI] All AI scoring providers failed:', e.message);
      throw e;
    }
  }

  async callJSONWithProviders(prompt, providers = ['openrouter', 'gemini']) {
    let lastError = null;

    for (const provider of providers) {
      try {
        console.log(`[AI] Trying ${provider} JSON response...`);
        const result = await this.callProvider(provider, prompt);
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

  async callProvider(provider, prompt, maxTokens = 4096) {
    if (provider === 'gemini') return this.callGemini(prompt);
    if (provider === 'openrouter') return this.callOpenRouter(prompt, maxTokens);
    if (provider === 'openai') return this.callOpenAI(prompt, maxTokens);
    throw new Error(`Unknown AI provider: ${provider}`);
  }
}

export const aiService = new AIService();
