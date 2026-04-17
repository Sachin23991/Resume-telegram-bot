import config from '../config/index.js';
import { Buffer } from 'buffer';
import { classifyProviderError } from '../utils/index.js';

const USERESUME_KEYS = config.useResumeKeys;

const BASE_URL = 'https://useresume.ai/api/v3';
const DEFAULT_JOB_TITLE = 'Target Role';

export class UseResumeService {
  constructor() {
    this.disabledKeys = new Set();
  }

  normalizeString(value, maxLength = null) {
    if (value === null || value === undefined) return undefined;
    const stringValue = String(value).trim();
    if (!stringValue) return undefined;
    return maxLength ? stringValue.slice(0, maxLength) : stringValue;
  }

  normalizeSkills(skills) {
    if (!Array.isArray(skills)) return undefined;

    const normalized = [];
    for (const skill of skills) {
      let value = skill;
      if (skill && typeof skill === 'object') {
        value = skill.name || skill.skill || skill.title || skill.value;
      }

      const normalizedSkill = this.normalizeString(value, 80);
      if (normalizedSkill && !normalized.includes(normalizedSkill)) {
        normalized.push(normalizedSkill);
      }

      if (normalized.length >= 25) break;
    }

    return normalized.length > 0 ? normalized : undefined;
  }

  sanitizeNode(value, path = []) {
    if (value === null || value === undefined) return undefined;

    const currentKey = path[path.length - 1]?.toLowerCase() || '';
    if (currentKey === 'skills') {
      return this.normalizeSkills(value);
    }

    if (typeof value === 'string') {
      return this.normalizeString(value, 4000);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      const sanitizedItems = value
        .map((item) => this.sanitizeNode(item, path))
        .filter((item) => item !== undefined && item !== null);

      return sanitizedItems.length > 0 ? sanitizedItems : undefined;
    }

    if (typeof value === 'object') {
      const sanitized = {};

      for (const [key, nestedValue] of Object.entries(value)) {
        const normalizedKey = key.toLowerCase();

        if (normalizedKey === 'skills') {
          const skills = this.normalizeSkills(nestedValue);
          if (skills) sanitized[key] = skills;
          continue;
        }

        const nextPath = [...path, key];
        const sanitizedValue = this.sanitizeNode(nestedValue, nextPath);
        if (sanitizedValue === undefined) continue;

        sanitized[key] = sanitizedValue;
      }

      return Object.keys(sanitized).length > 0 ? sanitized : undefined;
    }

    return undefined;
  }

  sanitizeResumeContent(content, resumeText) {
    if (!content || typeof content !== 'object') {
      const rawText = this.normalizeString(resumeText, 10000);
      return rawText ? { raw_text: rawText } : undefined;
    }

    const sanitized = this.sanitizeNode(content) || {};
    const fallbackText = this.normalizeString(
      resumeText || content.raw_text || content.text || content.resume_text,
      10000
    );

    if (fallbackText && !sanitized.raw_text) {
      sanitized.raw_text = fallbackText;
    }

    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  }

  getMimeType(fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mimeTypes = {
      'pdf': 'application/pdf',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'doc': 'application/msword',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
    };
    return mimeTypes[ext] || 'application/pdf';
  }

  bufferToUint8Array(buffer) {
    if (buffer instanceof Uint8Array) return buffer;
    if (Buffer.isBuffer(buffer)) {
      return new Uint8Array(buffer);
    }
    return new Uint8Array(buffer);
  }

  async parseResume(buffer, fileName = 'resume.pdf') {
    const uint8Array = this.bufferToUint8Array(buffer);
    const mimeType = this.getMimeType(fileName);
    const base64Data = Buffer.from(uint8Array).toString('base64');

    console.log(`[UseResume] parseResume: fileName=${fileName}, mimeType=${mimeType}, size=${uint8Array.length} bytes`);

    let lastError = null;

    for (let i = 0; i < USERESUME_KEYS.length; i++) {
      if (this.disabledKeys.has(i)) {
        continue;
      }
      const apiToken = USERESUME_KEYS[i];

      // Try method 1: JSON with file data
      try {
        console.log(`[UseResume] Method 1 (JSON file data) - key ${i + 1}...`);
        const response = await fetch(`${BASE_URL}/resume/parse`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiToken}`,
          },
          body: JSON.stringify({
            file: base64Data,
            filename: fileName,
            mime_type: mimeType,
            parse_to: 'json',
          }),
        });

        const data = await this.parseResponse(response, 'Method 1');
        if (data && !data.error) {
          console.log(`[UseResume] Method 1 succeeded with key ${i + 1}`);
          return { data, keyUsed: i + 1 };
        }
        if (this.shouldSkipKey(data)) {
          this.handleKeyFailure(i, data, 1);
          lastError = new Error(data.message || 'Key failed');
          console.log(`[UseResume] Key ${i + 1} is invalid/exhausted, trying next key`);
          continue;
        }
        lastError = new Error(`Method 1 failed: ${response.status}`);
      } catch (e) {
        lastError = e;
        console.log(`[UseResume] Method 1 error: ${e.message}`);
      }

      // Try method 2: multipart form-data
      try {
        console.log(`[UseResume] Method 2 (multipart) - key ${i + 1}...`);
        const formData = new FormData();
        const blob = new Blob([uint8Array], { type: mimeType });
        formData.append('file', blob, fileName);
        formData.append('parse_to', 'json');

        const response = await fetch(`${BASE_URL}/resume/parse`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiToken}` },
          body: formData,
        });

        const data = await this.parseResponse(response, 'Method 2');
        if (data && !data.error) {
          console.log(`[UseResume] Method 2 succeeded with key ${i + 1}`);
          return { data, keyUsed: i + 1 };
        }
        if (this.shouldSkipKey(data)) {
          this.handleKeyFailure(i, data, 1);
          lastError = new Error(data.message || 'Key failed');
          console.log(`[UseResume] Key ${i + 1} is invalid/exhausted, trying next key`);
          continue;
        }
        lastError = new Error(`Method 2 failed: ${response.status}`);
      } catch (e) {
        console.log(`[UseResume] Method 2 error: ${e.message}`);
        lastError = e;
      }

      // Try method 3: data URI format
      try {
        console.log(`[UseResume] Method 3 (data URI) - key ${i + 1}...`);
        const response = await fetch(`${BASE_URL}/resume/parse`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiToken}`,
          },
          body: JSON.stringify({
            file_url: `data:${mimeType};base64,${base64Data}`,
            parse_to: 'json',
          }),
        });

        const data = await this.parseResponse(response, 'Method 3');
        if (data && !data.error) {
          console.log(`[UseResume] Method 3 succeeded with key ${i + 1}`);
          return { data, keyUsed: i + 1 };
        }
        if (this.shouldSkipKey(data)) {
          this.handleKeyFailure(i, data, 1);
          lastError = new Error(data.message || 'Key failed');
          console.log(`[UseResume] Key ${i + 1} is invalid/exhausted, trying next key`);
          continue;
        }
        lastError = new Error(`Method 3 failed: ${response.status}`);
      } catch (e) {
        console.log(`[UseResume] Method 3 error: ${e.message}`);
        lastError = e;
      }
    }

    throw new Error(`All UseResume keys failed. Last error: ${lastError?.message}`);
  }

  async createTailoredResume(cvBuffer, jobDescription, fileName = 'resume.pdf', options = {}) {
    const uint8Array = this.bufferToUint8Array(cvBuffer);
    const mimeType = this.getMimeType(fileName);

    console.log(`[UseResume] createTailoredResume: fileName=${fileName}, size=${uint8Array.length} bytes`);

    let lastError = null;

    // First parse the resume to get structured data
    let parsedResume = options.parsedData || null;
    if (!parsedResume) {
      try {
        const parseResult = await this.parseResume(cvBuffer, fileName);
        parsedResume = parseResult.data;
        console.log(`[UseResume] Resume parsed successfully for tailoring`);
      } catch (e) {
        console.log(`[UseResume] Could not parse resume for tailoring: ${e.message}`);
      }
    }

    const parsedResumeContent = this.toResumeContentPayload(parsedResume, options.resumeText);

    for (let i = 0; i < USERESUME_KEYS.length; i++) {
      if (this.disabledKeys.has(i)) {
        continue;
      }
      const apiToken = USERESUME_KEYS[i];

      // Method 1: Use parsed resume data in the shape required by the API.
      if (parsedResumeContent) {
        try {
          console.log(`[UseResume] Method 1 (parsed data object) - key ${i + 1}...`);
          const response = await fetch(`${BASE_URL}/resume/create-tailored`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiToken}`,
            },
            body: JSON.stringify({
              resume_content: parsedResumeContent,
              target_job: {
                job_title: options.jobTitle || DEFAULT_JOB_TITLE,
                job_description: jobDescription,
              },
            }),
          });

          const data = await this.parseResponse(response, 'Method 1 (parsed data)');
          if (data && !data.error) {
            console.log(`[UseResume] Method 1 (parsed data) succeeded with key ${i + 1}`);
            return { data, keyUsed: i + 1 };
          }
          if (this.shouldSkipKey(data)) {
            this.handleKeyFailure(i, data, 1);
            lastError = new Error(data.message || 'Key failed');
            console.log(`[UseResume] Key ${i + 1} is invalid/exhausted, trying next key`);
            continue;
          }
          lastError = new Error(`Method 1 (parsed data) failed: ${response.status}`);
        } catch (e) {
          console.log(`[UseResume] Method 1 (parsed data) error: ${e.message}`);
          lastError = e;
        }
      }

      // Method 2: Try with plain text wrapped as resume_content.content.
      try {
        console.log(`[UseResume] Method 2 (text) - key ${i + 1}...`);
        const cvTextContent = options.resumeText || await this.extractTextFromBuffer(cvBuffer, mimeType);

        const response = await fetch(`${BASE_URL}/resume/create-tailored`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiToken}`,
          },
          body: JSON.stringify({
            resume_content: this.toResumeContentPayload(null, cvTextContent),
            target_job: {
              job_title: options.jobTitle || DEFAULT_JOB_TITLE,
              job_description: jobDescription,
            },
          }),
        });

        const data = await this.parseResponse(response, 'Method 2 (text)');
        if (data && !data.error) {
          console.log(`[UseResume] Method 2 (text) succeeded with key ${i + 1}`);
          return { data, keyUsed: i + 1 };
        }
        if (this.shouldSkipKey(data)) {
          this.handleKeyFailure(i, data, 1);
          lastError = new Error(data.message || 'Key failed');
          console.log(`[UseResume] Key ${i + 1} is invalid/exhausted, trying next key`);
          continue;
        }
        lastError = new Error(`Method 2 (text) failed: ${response.status}`);
      } catch (e) {
        console.log(`[UseResume] Method 2 (text) error: ${e.message}`);
        lastError = e;
      }
    }

    throw new Error(`All UseResume keys failed. Last error: ${lastError?.message}`);
  }

  async createTailoredCoverLetter(cvBuffer, jobDescription, fileName = 'resume.pdf', options = {}) {
    const uint8Array = this.bufferToUint8Array(cvBuffer);
    const mimeType = this.getMimeType(fileName);

    console.log(`[UseResume] createTailoredCoverLetter: fileName=${fileName}, size=${uint8Array.length} bytes`);

    let lastError = null;

    // First parse the resume to get structured data
    let parsedResume = options.parsedData || null;
    if (!parsedResume) {
      try {
        const parseResult = await this.parseResume(cvBuffer, fileName);
        parsedResume = parseResult.data;
        console.log(`[UseResume] Resume parsed for cover letter`);
      } catch (e) {
        console.log(`[UseResume] Could not parse resume for cover letter: ${e.message}`);
      }
    }

    const parsedResumeContent = this.toResumeContentPayload(parsedResume, options.resumeText);

    for (let i = 0; i < USERESUME_KEYS.length; i++) {
      if (this.disabledKeys.has(i)) {
        continue;
      }
      const apiToken = USERESUME_KEYS[i];

      // Method 1: Use cover_letter_content with parsed resume content.
      if (parsedResumeContent) {
        try {
          console.log(`[UseResume] Cover Letter Method 1 (parsed data) - key ${i + 1}...`);
          const response = await fetch(`${BASE_URL}/cover-letter/create-tailored`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiToken}`,
            },
            body: JSON.stringify({
              cover_letter_content: parsedResumeContent,
              target_job: {
                job_title: options.jobTitle || DEFAULT_JOB_TITLE,
                job_description: jobDescription,
              },
            }),
          });

          const data = await this.parseResponse(response, 'Method 1 (parsed data)');
          if (data && !data.error) {
            console.log(`[UseResume] Cover Letter Method 1 (parsed data) succeeded with key ${i + 1}`);
            return { data, keyUsed: i + 1 };
          }
          if (this.shouldSkipKey(data)) {
            this.handleKeyFailure(i, data, 1);
            lastError = new Error(data.message || 'Key failed');
            console.log(`[UseResume] Key ${i + 1} is invalid/exhausted, trying next key`);
            continue;
          }
          lastError = new Error(`Method 1 (parsed data) failed: ${response.status}`);
        } catch (e) {
          console.log(`[UseResume] Cover Letter Method 1 (parsed data) error: ${e.message}`);
          lastError = e;
        }
      }

      // Method 2: Try with plain text
      try {
        console.log(`[UseResume] Cover Letter Method 2 (text) - key ${i + 1}...`);
        const cvTextContent = options.resumeText || await this.extractTextFromBuffer(cvBuffer, mimeType);

        const response = await fetch(`${BASE_URL}/cover-letter/create-tailored`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiToken}`,
          },
          body: JSON.stringify({
            cover_letter_content: this.toResumeContentPayload(null, cvTextContent),
            target_job: {
              job_title: options.jobTitle || DEFAULT_JOB_TITLE,
              job_description: jobDescription,
            },
          }),
        });

        const data = await this.parseResponse(response, 'Method 2 (text)');
        if (data && !data.error) {
          console.log(`[UseResume] Cover Letter Method 2 (text) succeeded with key ${i + 1}`);
          return { data, keyUsed: i + 1 };
        }
        if (this.shouldSkipKey(data)) {
          this.handleKeyFailure(i, data, 1);
          lastError = new Error(data.message || 'Key failed');
          console.log(`[UseResume] Key ${i + 1} is invalid/exhausted, trying next key`);
          continue;
        }
        lastError = new Error(`Method 2 (text) failed: ${response.status}`);
      } catch (e) {
        console.log(`[UseResume] Cover Letter Method 2 (text) error: ${e.message}`);
        lastError = e;
      }
    }

    throw new Error(`All UseResume keys failed. Last error: ${lastError?.message}`);
  }

  toResumeContentPayload(parsedResume, resumeText) {
    if (parsedResume) {
      const content =
        parsedResume.content ||
        parsedResume.data?.content ||
        parsedResume.data ||
        parsedResume.result?.content ||
        parsedResume.result ||
        parsedResume;

      const sanitizedContent = this.sanitizeResumeContent(content, resumeText);
      if (sanitizedContent) {
        return { content: sanitizedContent };
      }
    }

    if (resumeText) {
      const sanitizedContent = this.sanitizeResumeContent(null, resumeText);
      if (sanitizedContent) {
        return { content: sanitizedContent };
      }
    }

    return null;
  }

  shouldSkipKey(data) {
    if (!data || !data.error) return false;

    const message = `${data.message || data.details || data.error || ''}`.toLowerCase();
    return (
      data.status === 401 ||
      data.status === 403 ||
      message.includes('invalid api') ||
      message.includes('invalid credit') ||
      message.includes('credit') ||
      message.includes('quota') ||
      message.includes('limit') ||
      message.includes('unauthorized') ||
      message.includes('forbidden')
    );
  }

  handleKeyFailure(keyIndex, data, attempt) {
    const category = classifyProviderError(data?.status || 0, data?.message || data?.details || '');
    if (category === 'auth' || category === 'credit') {
      this.disabledKeys.add(keyIndex);
      return;
    }

    return;
  }

  findGeneratedFileUrl(data) {
    if (!data || typeof data !== 'object') return null;

    const directCandidates = [
      data.file_url,
      data.fileUrl,
      data.download_url,
      data.downloadUrl,
      data.pdf_url,
      data.pdfUrl,
      data.url,
      data.data?.file_url,
      data.data?.fileUrl,
      data.data?.download_url,
      data.data?.downloadUrl,
      data.data?.pdf_url,
      data.data?.pdfUrl,
      data.data?.url,
      data.result?.file_url,
      data.result?.fileUrl,
      data.result?.download_url,
      data.result?.downloadUrl,
      data.result?.pdf_url,
      data.result?.pdfUrl,
      data.result?.url,
    ];

    const direct = directCandidates.find((value) => typeof value === 'string' && /^https?:\/\//i.test(value));
    if (direct) return direct;

    for (const value of Object.values(data)) {
      if (Array.isArray(value)) {
        const found = value.find((item) => typeof item === 'string' && /^https?:\/\//i.test(item));
        if (found) return found;
      }
      if (value && typeof value === 'object') {
        const nested = this.findGeneratedFileUrl(value);
        if (nested) return nested;
      }
    }

    return null;
  }

  async extractGeneratedDocument(data, originalFileName = 'resume.pdf', originalMimeType = 'application/pdf') {
    if (!data) return null;

    const fileUrl = this.findGeneratedFileUrl(data);
    if (!fileUrl) return null;

    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Generated file download failed: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || originalMimeType || 'application/pdf';
    const buffer = Buffer.from(arrayBuffer);
    const extension = this.extensionFromContentType(contentType) || originalFileName.split('.').pop() || 'pdf';
    const baseName = originalFileName.replace(/\.[^/.]+$/, '');

    return {
      buffer,
      fileName: `${baseName}_improved.${extension}`,
      mimeType: contentType,
      sourceUrl: fileUrl,
    };
  }

  extensionFromContentType(contentType) {
    if (contentType.includes('pdf')) return 'pdf';
    if (contentType.includes('wordprocessingml')) return 'docx';
    if (contentType.includes('msword')) return 'doc';
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
    return null;
  }

  // Helper to parse API response (handles both JSON and HTML)
  async parseResponse(response, methodName) {
    const responseText = await response.text();
    const contentType = response.headers.get('content-type') || '';

    console.log(`[UseResume] ${methodName} response: ${response.status} - ${responseText.slice(0, 200)}`);

    // Check if HTTP status indicates error
    if (!response.ok) {
      console.log(`[UseResume] ${methodName} HTTP error: ${response.status}`);
      const parsedError = this.parseErrorResponse(responseText);
      return {
        error: true,
        status: response.status,
        message: parsedError.message || responseText.slice(0, 200),
        details: parsedError.details,
      };
    }

    // Check if response is HTML
    if (contentType.includes('text/html') || responseText.trim().startsWith('<!')) {
      console.log(`[UseResume] ${methodName} returned HTML instead of JSON`);
      // Try to extract useful info from HTML
      const titleMatch = responseText.match(/<title>([^<]+)<\/title>/i);
      const errorMatch = responseText.match(/class="error"[^>]*>([^<]+)</i) ||
                         responseText.match(/error["\s:]+([^"<]+)/i);

      return {
        error: true,
        message: errorMatch?.[1] || titleMatch?.[1] || 'API returned HTML',
        status: response.status,
      };
    }

    // Try to parse as JSON
    try {
      const data = JSON.parse(responseText);

      // Handle case where response is a plain string (e.g., "Invalid API Credit number")
      if (typeof data === 'string') {
        console.log(`[UseResume] ${methodName} returned string: ${data}`);
        return { error: true, message: data };
      }

      // Check for error objects
      if (data.error) {
        return { error: true, ...data };
      }

      // Check for credit/quota error messages
      const messageStr = (data.message || '').toLowerCase();
      if (messageStr.includes('credit') || messageStr.includes('quota') || messageStr.includes('limit')) {
        return { error: true, ...data };
      }

      // Check for other common error indicators
      if (data.success === false || data.status === 'error') {
        return { error: true, ...data };
      }

      // Valid response with data
      return data;
    } catch (e) {
      console.log(`[UseResume] ${methodName} JSON parse error: ${e.message}`);
      return { error: true, message: 'Invalid JSON response', raw: responseText.slice(0, 500) };
    }
  }

  parseErrorResponse(responseText) {
    try {
      const parsed = JSON.parse(responseText);
      if (typeof parsed === 'string') {
        return { message: parsed };
      }
      return {
        message: parsed.message || parsed.error || '',
        details: parsed.details || '',
      };
    } catch {
      return { message: responseText.slice(0, 200), details: '' };
    }
  }

  // Simple text extraction from buffer (basic implementation)
  async extractTextFromBuffer(buffer, mimeType) {
    // For PDF, we need pdf-parse. For now, return a placeholder
    // The actual text extraction is done by CVExtractorService
    try {
      const text = buffer.toString('utf-8');
      // Remove non-printable characters
      return text.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 10000);
    } catch (e) {
      return 'Resume content';
    }
  }
}

export const useResumeService = new UseResumeService();
