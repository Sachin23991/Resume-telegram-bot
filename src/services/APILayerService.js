import config from '../config/index.js';
import { Buffer } from 'buffer';
import { classifyProviderError, getBackoffDelayMs, sleep } from '../utils/index.js';

const APILAYER_KEYS = config.apilayerKeys || [];

const PARSE_UPLOAD_URL = 'https://api.apilayer.com/resume_parser/upload';
const PARSE_URL_ENDPOINT = 'https://api.apilayer.com/resume_parser/url';

export class APILayerService {
  constructor() {
    this.disabledKeys = new Set();
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

    return mimeTypes[ext] || 'application/octet-stream';
  }

  async parseResumeFromBuffer(buffer, fileName = 'resume.pdf') {
    let lastError = null;
    const mimeType = this.getMimeType(fileName);

    for (let i = 0; i < APILAYER_KEYS.length; i++) {
      if (this.disabledKeys.has(i)) {
        continue;
      }
      const apiKey = APILAYER_KEYS[i];

      try {
        console.log(`[APILayer] Parsing with key ${i + 1}/${APILAYER_KEYS.length}...`);

        const response = await fetch(PARSE_UPLOAD_URL, {
          method: 'POST',
          headers: {
            'apikey': apiKey,
            'Content-Type': mimeType,
          },
          body: buffer,
        });

        const responseText = await response.text();
        console.log(`[APILayer] Key ${i + 1} response: ${response.status}`);

        // Check HTTP status first
        if (response.status === 429) {
          console.log(`[APILayer] Key ${i + 1} rate limited, trying next key`);
          lastError = new Error('Rate limited');
          await sleep(getBackoffDelayMs(1, 'rate_limit', response.headers.get('Retry-After')));
          continue; // Try next key
        }

        if (!response.ok) {
          console.log(`[APILayer] Key ${i + 1} HTTP error: ${response.status} - ${responseText.slice(0, 100)}`);
          lastError = new Error(`HTTP ${response.status}: ${responseText.slice(0, 100)}`);
          continue; // Try next key
        }

        // Parse response
        try {
          const data = JSON.parse(responseText);

          // Check for error responses
          if (typeof data === 'string') {
            // Plain string error
            console.log(`[APILayer] Key ${i + 1} returned string error: ${data}`);
            lastError = new Error(data);
            continue;
          }

          if (data.error || data.message?.toLowerCase().includes('credit')) {
            console.log(`[APILayer] Key ${i + 1} credits exhausted, trying next key`);
            lastError = new Error(data.message || data.error || 'Credits exhausted');
            const category = classifyProviderError(response.status, data.message || data.error || '');
            if (category === 'auth' || category === 'credit') this.disabledKeys.add(i);
            continue; // Try next key
          }

          // Success!
          console.log(`[APILayer] Key ${i + 1} succeeded`);
          return {
            data: this.normalizeParsedData(data),
            keyUsed: i + 1,
          };
        } catch (parseError) {
          console.log(`[APILayer] Key ${i + 1} JSON parse error: ${parseError.message}`);
          lastError = new Error('Invalid JSON response');
          continue; // Try next key
        }
      } catch (error) {
        console.log(`[APILayer] Key ${i + 1} network error: ${error.message}`);
        lastError = error;
        continue; // Try next key
      }
    }

    throw new Error(`All APILayer keys failed. Last error: ${lastError?.message}`);
  }

  async parseResumeFromUrl(resumeUrl) {
    let lastError = null;

    for (let i = 0; i < APILAYER_KEYS.length; i++) {
      if (this.disabledKeys.has(i)) {
        continue;
      }
      const apiKey = APILAYER_KEYS[i];

      try {
        console.log(`[APILayer] Parsing URL with key ${i + 1}/${APILAYER_KEYS.length}...`);

        const response = await fetch(`${PARSE_URL_ENDPOINT}?url=${encodeURIComponent(resumeUrl)}`, {
          method: 'GET',
          headers: {
            'apikey': apiKey,
          },
        });

        const responseText = await response.text();
        console.log(`[APILayer] Key ${i + 1} response: ${response.status}`);

        if (response.status === 429) {
          console.log(`[APILayer] Key ${i + 1} rate limited, trying next key`);
          lastError = new Error('Rate limited');
          await sleep(getBackoffDelayMs(1, 'rate_limit', response.headers.get('Retry-After')));
          continue;
        }

        if (!response.ok) {
          console.log(`[APILayer] Key ${i + 1} HTTP error: ${response.status}`);
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }

        try {
          const data = JSON.parse(responseText);

          if (typeof data === 'string') {
            console.log(`[APILayer] Key ${i + 1} returned string error: ${data}`);
            lastError = new Error(data);
            continue;
          }

          if (data.error || data.message?.toLowerCase().includes('credit')) {
            console.log(`[APILayer] Key ${i + 1} credits exhausted, trying next key`);
            lastError = new Error(data.message || 'Credits exhausted');
            const category = classifyProviderError(response.status, data.message || data.error || '');
            if (category === 'auth' || category === 'credit') this.disabledKeys.add(i);
            continue;
          }

          console.log(`[APILayer] Key ${i + 1} succeeded`);
          return {
            data: this.normalizeParsedData(data),
            keyUsed: i + 1,
          };
        } catch (parseError) {
          console.log(`[APILayer] Key ${i + 1} JSON parse error`);
          lastError = new Error('Invalid JSON response');
          continue;
        }
      } catch (error) {
        console.log(`[APILayer] Key ${i + 1} error: ${error.message}`);
        lastError = error;
        continue;
      }
    }

    throw new Error(`All APILayer keys failed. Last error: ${lastError?.message}`);
  }

  normalizeParsedData(data) {
    return {
      name: data.name || data.full_name || null,
      email: data.email || data.emails?.[0] || null,
      phone: data.phone || data.phones?.[0] || null,
      location: data.location || data.address || null,
      summary: data.summary || data.objective || null,
      skills: Array.isArray(data.skills) ? data.skills : [],
      education: Array.isArray(data.education)
        ? data.education.map(edu => ({
            institution: edu.name || edu.institution || edu.school || null,
            degree: edu.degree || edu.degree_name || null,
            dates: edu.dates || edu.graduation_date || null,
          }))
        : [],
      experience: Array.isArray(data.experience)
        ? data.experience.map(exp => ({
            title: exp.title || exp.job_title || null,
            company: exp.company || exp.organization || null,
            dates: exp.dates || exp.start_date || null,
            location: exp.location || null,
            description: exp.description || null,
          }))
        : [],
      raw: data,
    };
  }
}

export const apiLayerService = new APILayerService();