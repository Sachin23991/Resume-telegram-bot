import config from '../config/index.js';

const AFFINDA_KEYS = config.affindaKeys || [];
const BASE_URL_V2 = 'https://api.affinda.com/v2';
const BASE_URL_V3 = 'https://api.affinda.com/v3';

export class AffindaService {
  constructor() {
    this.currentKeyIndex = 0;
  }

  getMimeType(fileName = 'resume.pdf') {
    const ext = String(fileName).split('.').pop()?.toLowerCase();
    const mimeTypes = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
    };

    return mimeTypes[ext] || 'application/pdf';
  }

  getNextKey() {
    if (AFFINDA_KEYS.length === 0) {
      throw new Error('No Affinda API keys configured');
    }
    const key = AFFINDA_KEYS[this.currentKeyIndex];
    const keyIndex = this.currentKeyIndex;
    this.currentKeyIndex = (this.currentKeyIndex + 1) % AFFINDA_KEYS.length;
    return { key, keyIndex: keyIndex + 1 };
  }

  /**
   * Upload a resume to Affinda and get parsed data
   * Uses v2/resumes endpoint (works without workspace)
   */
  async uploadResume(buffer, fileName = 'resume.pdf') {
    let lastError = null;
    const mimeType = this.getMimeType(fileName);

    for (let attempt = 0; attempt < AFFINDA_KEYS.length; attempt++) {
      const { key, keyIndex } = this.getNextKey();

      try {
        console.log(`[Affinda] Uploading resume with key ${keyIndex}/${AFFINDA_KEYS.length}...`);

        const formData = new FormData();
        formData.append('file', new Blob([buffer], { type: mimeType }), fileName);

        // Use v2 endpoint - works without workspace
        const response = await fetch(`${BASE_URL_V2}/resumes`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
          },
          body: formData,
        });

        const responseText = await response.text();

        if (response.status === 401) {
          console.log(`[Affinda] Key ${keyIndex} unauthorized`);
          lastError = new Error('Unauthorized');
          continue;
        }

        if (response.status === 429) {
          console.log(`[Affinda] Key ${keyIndex} rate limited`);
          lastError = new Error('Rate limited');
          continue;
        }

        if (!response.ok) {
          console.log(`[Affinda] Key ${keyIndex} failed: ${response.status} - ${responseText.slice(0, 200)}`);
          lastError = new Error(`API error: ${response.status}`);
          continue;
        }

        const data = JSON.parse(responseText);
        console.log(`[Affinda] Resume uploaded successfully with key ${keyIndex}`);

        // v2 returns data directly in data property
        const uid = data.uid || data.id || data.data?.uid;
        const parsedData = data.data || data;

        return {
          uid,
          data: this.normalizeResumeData(parsedData),
          keyUsed: keyIndex,
          raw: data,
        };
      } catch (error) {
        console.log(`[Affinda] Key ${keyIndex} error: ${error.message}`);
        lastError = error;
      }
    }

    throw new Error(`Affinda resume upload failed: ${lastError?.message}`);
  }

  /**
   * Get match score using Affinda's scoring
   * Since v3 match requires workspace, we'll use v2 parsed data + manual scoring
   */
  async getScore(cvBuffer, jobDescription, fileName = 'resume.pdf') {
    try {
      // Upload and parse the resume
      console.log('[Affinda] Uploading resume for scoring...');
      const resumeResult = await this.uploadResume(cvBuffer, fileName);

      // Use parsed data for scoring with AI (fallback to Gemini/OpenRouter)
      // Affinda gives us structured data which improves scoring quality
      return {
        score: null, // Will be calculated by AI
        parsedData: resumeResult.data,
        resumeUid: resumeResult.uid,
        needsAIScoring: true, // Flag to indicate AI should score
      };
    } catch (error) {
      console.log(`[Affinda] getScore error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Normalize Affinda resume data to standard format
   */
  normalizeResumeData(data) {
    const result = data.data || data;

    // Extract name
    const name = result.name?.raw ||
                 (result.name?.first || result.name?.last ?
                  `${result.name.first || ''} ${result.name.last || ''}`.trim() :
                  null) ||
                 result.name ||
                 null;

    // Extract email
    const email = result.emails?.[0]?.email ||
                   result.emails?.[0] ||
                   result.email ||
                   null;

    // Extract phone
    const phone = result.phoneNumbers?.[0]?.raw ||
                  result.phoneNumbers?.[0] ||
                  result.phone ||
                  null;

    // Extract location
    const location = result.location?.raw ||
                     result.location?.city ?
                     `${result.location.city}${result.location.country ? ', ' + result.location.country : ''}` :
                     result.location ||
                     null;

    // Extract skills
    const skills = (result.skills || []).map(s =>
      typeof s === 'string' ? s : s?.name || s?.text
    ).filter(Boolean);

    // Extract education
    const education = (result.education || []).map(edu => ({
      institution: edu.organization?.raw || edu.school || edu.institution || null,
      degree: edu.degree?.raw || edu.degree || null,
      dates: edu.dates?.raw || edu.dates || null,
    }));

    // Extract experience
    const experience = (result.experience || (result.workExperience?.[0]?.workExperience || [])).map(exp => ({
      title: exp.jobTitle?.raw || exp.job_title || exp.title || null,
      company: exp.organization?.raw || exp.company || exp.organization || null,
      dates: exp.dates?.raw || exp.dates || null,
      location: exp.location?.raw || exp.location || null,
      description: exp.description?.raw || exp.jobDescription?.raw || exp.description || null,
    }));

    return {
      name,
      email,
      phone,
      location,
      summary: result.objective?.raw || result.summary?.raw || result.objective || result.summary || null,
      skills,
      education,
      experience,
      languages: result.languages || [],
      certifications: result.certifications || [],
      raw: data,
    };
  }
}

export const affindaService = new AffindaService();
