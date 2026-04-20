import config from '../config/index.js';

const RESUME_SCORE_KEYS = config.resumeScoreKeys;

const API_URL = 'https://api.apyhub.com/sharpapi/api/v1/hr/resume_job_match_score';
const STATUS_URL = `${API_URL}/job/status`;
const REQUEST_TIMEOUT_MS = 15000;
const STATUS_REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_MAX_POLLS = 8;

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export class ResumeScoreService {
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

  unwrapEnvelope(data) {
    if (!data || typeof data !== 'object') return data;

    const nestedCandidates = [
      data.data,
      data.result,
      data.payload,
    ];

    for (const candidate of nestedCandidates) {
      if (candidate && typeof candidate === 'object') {
        return candidate;
      }
    }

    return data;
  }

  async getScore(cvBuffer, jobDescription, fileName = 'resume.pdf', language = 'English') {
    let lastError = null;
    const mimeType = this.getMimeType(fileName);

    for (let i = 0; i < RESUME_SCORE_KEYS.length; i++) {
      const apiToken = RESUME_SCORE_KEYS[i];
      const formData = new FormData();
      formData.append('file', new Blob([cvBuffer], { type: mimeType }), fileName);
      formData.append('content', jobDescription);
      formData.append('language', language);

      try {
        console.log(`Trying API key ${i + 1}/${RESUME_SCORE_KEYS.length}...`);

        const response = await fetchWithTimeout(API_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'apy-token': apiToken,
          },
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.log(`Key ${i + 1} failed: ${response.status} - ${errorText.slice(0, 200)}`);
          lastError = new Error(`API error: ${response.status}`);
          continue;
        }

        const responseText = await response.text();
        let data;

        // Check if response is HTML
        if (responseText.trim().startsWith('<!') || responseText.includes('<html')) {
          console.log(`Key ${i + 1} returned HTML instead of JSON`);
          lastError = new Error('API returned HTML response');
          continue;
        }

        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.log(`Key ${i + 1} JSON parse error: ${parseError.message}`);
          lastError = new Error('Invalid JSON response');
          continue;
        }

        // Check if response indicates error/credits exhausted
        const message = typeof data.message === 'string' ? data.message.toLowerCase() : '';
        if (data.error || message.includes('credit') || message.includes('quota')) {
          console.log(`Key ${i + 1} failed: credits/limit issue`);
          lastError = new Error(data.message || 'Credits exhausted');
          continue;
        }

        // Check if this is an async response (returns job_id/status_url)
        if (data.job_id || data.status_url) {
          console.log(`Key ${i + 1} returned async job: ${data.job_id || 'N/A'}`);
          // Poll for result
          const result = await this.pollStatus(data, apiToken);
          if (result) {
            const score = this.extractScore(result);
            if (score !== null) {
              console.log(`Key ${i + 1} succeeded with score: ${score}`);
              return {
                score,
                keyUsed: i + 1,
                rawResponse: result,
              };
            }
          }
          lastError = new Error('Async job did not return score after polling');
          continue;
        }

        // Extract score from synchronous response
        const score = this.extractScore(data);
        if (score !== null) {
          console.log(`Key ${i + 1} succeeded with score: ${score}`);
          return {
            score,
            keyUsed: i + 1,
            rawResponse: data,
          };
        }

        console.log(`Key ${i + 1} response received but score not found. Top-level keys: ${Object.keys(data || {}).join(', ')}`);
        lastError = new Error('Could not extract score from response');
      } catch (error) {
        console.log(`Key ${i + 1} network error: ${error.message}`);
        lastError = error;
      }
    }

    throw new Error(`All ${RESUME_SCORE_KEYS.length} API keys failed. Last error: ${lastError?.message}`);
  }

  getStatusUrls(jobData) {
    const urls = [];
    const candidates = [jobData, this.unwrapEnvelope(jobData)];

    for (const candidate of candidates) {
      if (candidate?.job_id) {
        urls.push(`${STATUS_URL}/${encodeURIComponent(candidate.job_id)}`);
      }

      if (typeof candidate?.status_url === 'string' && candidate.status_url.startsWith('http')) {
        try {
          const parsedUrl = new URL(candidate.status_url);
          const isApiStatusUrl =
            parsedUrl.hostname === 'api.apyhub.com' &&
            parsedUrl.pathname.includes('/sharpapi/api/v1/hr/resume_job_match_score/job/status/');

          if (isApiStatusUrl) {
            urls.push(candidate.status_url);
          } else {
            console.log(`  Ignoring non-API status URL: ${candidate.status_url}`);
          }
        } catch {
          console.log(`  Ignoring invalid status URL: ${candidate.status_url}`);
        }
      }
    }

    return [...new Set(urls)];
  }

  async pollStatus(jobData, apiToken, maxPolls = DEFAULT_MAX_POLLS) {
    const statusUrls = this.getStatusUrls(jobData);
    if (statusUrls.length === 0) {
      console.log('  No status URL or job_id returned by score API');
      return null;
    }

    const disabledUrls = new Set();

    for (let i = 0; i < maxPolls; i++) {
      for (const statusUrl of statusUrls) {
        if (disabledUrls.has(statusUrl)) continue;

        try {
          console.log(`  Poll ${i + 1}/${maxPolls}: ${statusUrl}`);

          const response = await fetchWithTimeout(statusUrl, {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'apy-token': apiToken,
            },
          }, STATUS_REQUEST_TIMEOUT_MS);

          const contentType = response.headers.get('content-type') || '';
          const responseText = await response.text();

          if (contentType.includes('text/html') || responseText.trim().startsWith('<!')) {
            console.log(`  Poll returned HTML from ${statusUrl}, trying next status URL if available`);
            disabledUrls.add(statusUrl);
            continue;
          }

          if (!response.ok) {
            console.log(`  Poll HTTP error ${response.status}: ${responseText.slice(0, 160)}`);
            if ([400, 401, 403, 404, 405, 410].includes(response.status)) {
              disabledUrls.add(statusUrl);
            }
            continue;
          }

          let data;
          try {
            data = JSON.parse(responseText);
          } catch (parseError) {
            console.log(`  Poll JSON parse error: ${parseError.message}`);
            continue;
          }

          const payload = this.unwrapEnvelope(data);
          const payloadStatus = payload?.status || data.status || 'N/A';
          console.log(`  Status: ${payloadStatus}, Keys: ${Object.keys(data).slice(0, 5).join(', ')}`);

          if (
            payload?.status === 'completed' ||
            data.status === 'completed' ||
            payload?.score !== undefined ||
            data.score !== undefined ||
            payload?.result?.score !== undefined ||
            data.result?.score !== undefined
          ) {
            console.log(`  Processing complete!`);
            return payload || data;
          }

          if (payload && typeof payload === 'object') {
            const nestedScore = this.extractScore(payload);
            if (nestedScore !== null) {
              console.log(`  Found score in result object: ${nestedScore}`);
              return payload;
            }
          }

          if (typeof payload?.result === 'string' || typeof data.result === 'string') {
            const nestedScore = this.extractScore(payload || data);
            if (nestedScore !== null) {
              console.log(`  Found score in result string: ${nestedScore}`);
              return payload || data;
            }
          }

          if (payload?.status === 'failed' || data.status === 'failed' || payload?.error || data.error) {
            console.log(`  Processing failed: ${payload?.error || data.error || payload?.message || data.message}`);
            return null;
          }
        } catch (error) {
          console.log(`  Poll error: ${error.message}`);
        }
      }

      if (disabledUrls.size === statusUrls.length) {
        console.log('  No usable status URLs remain');
        return null;
      }

      if (i < maxPolls - 1) {
        const waitTime = Math.min(1000 + (i * 500), 2500);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    console.log(`  Polling timed out`);
    return null;
  }

  extractScore(data) {
    const toScore = (value) => {
      if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
      if (typeof value === 'string') {
        const match = value.match(/-?\d+(?:\.\d+)?/);
        if (!match) return null;
        const numeric = Number(match[0]);
        return Number.isFinite(numeric) ? Math.round(numeric) : null;
      }
      return null;
    };

    // Try common direct shapes first
    const envelope = this.unwrapEnvelope(data);
    const directCandidates = [
      data,
      envelope,
      data?.score,
      data?.match_score,
      data?.matchScore,
      data?.percentage,
      data?.compatibility_score,
      data?.data,
      data?.data?.score,
      data?.data?.match_score,
      data?.data?.matchScore,
      data?.result,
      data?.result?.score,
      data?.result?.match_score,
      data?.result?.matchScore,
      data?.result?.percentage,
      data?.result?.compatibility_score,
      envelope?.score,
      envelope?.match_score,
      envelope?.matchScore,
      envelope?.percentage,
      envelope?.compatibility_score,
      envelope?.result,
      envelope?.result?.score,
      envelope?.result?.match_score,
      envelope?.result?.matchScore,
      envelope?.result?.percentage,
      envelope?.result?.compatibility_score,
    ];

    for (const candidate of directCandidates) {
      const parsed = toScore(candidate);
      if (parsed !== null) return parsed;
    }

    // If result is a JSON string, parse and recurse once
    if (typeof data?.result === 'string') {
      try {
        const parsedResult = JSON.parse(data.result);
        const nestedScore = this.extractScore(parsedResult);
        if (nestedScore !== null) return nestedScore;
      } catch {
        const inlineScore = toScore(data.result);
        if (inlineScore !== null) return inlineScore;
      }
    }

    // Deep search for score-like fields
    const findScore = (obj, depth = 0) => {
      if (depth > 8 || !obj || typeof obj !== 'object') return null;

      for (const [key, value] of Object.entries(obj)) {
        const keyName = key.toLowerCase();
        const looksLikeScore =
          keyName.includes('score') ||
          keyName.includes('match') ||
          keyName.includes('percentage') ||
          keyName.includes('compatibility');

        if (looksLikeScore) {
          const parsed = toScore(value);
          if (parsed !== null) return parsed;
        }

        if (value && typeof value === 'object') {
          const nested = findScore(value, depth + 1);
          if (nested !== null) return nested;
        }
      }

      return null;
    };

    return findScore(data);
  }
}

export const resumeScoreService = new ResumeScoreService();
