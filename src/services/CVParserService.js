import config from '../config/index.js';

const CVPARSER_KEYS = config.cvParserKeys;
const CVPARSER_API_URL = config.cvParserApiUrl;

export class CVParserService {
  async parseResume(resumeUrl) {
    if (!resumeUrl) {
      throw new Error('CVParser requires a resume URL');
    }

    let lastError = null;

    for (let i = 0; i < CVPARSER_KEYS.length; i++) {
      const apiToken = CVPARSER_KEYS[i];

      try {
        console.log(`[CVParser] Trying key ${i + 1}/${CVPARSER_KEYS.length}...`);
        const graphqlResponse = await fetch(CVPARSER_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiToken,
          },
          body: JSON.stringify({
            query: 'mutation($url:String!){ processCV(url:$url) }',
            variables: { url: resumeUrl },
          }),
        });

        if (!graphqlResponse.ok) {
          console.log(`[CVParser] Key ${i + 1} GraphQL failed: ${graphqlResponse.status}`);
          lastError = new Error(`GraphQL error: ${graphqlResponse.status}`);
          continue;
        }

        const result = await graphqlResponse.json();

        if (result.errors || (result.message && result.message.toLowerCase().includes('credit'))) {
          console.log(`[CVParser] Key ${i + 1} failed: ${result.errors?.[0]?.message || result.message}`);
          lastError = new Error(result.message || result.errors?.[0]?.message || 'API error');
          continue;
        }

        console.log(`[CVParser] Key ${i + 1} succeeded`);
        return {
          data: result.data || result,
          keyUsed: i + 1,
        };
      } catch (error) {
        console.log(`[CVParser] Key ${i + 1} error: ${error.message}`);
        lastError = error;
      }
    }

    throw new Error(`All CVParser keys failed. Last error: ${lastError?.message}`);
  }

  extractParsedData(data) {
    if (!data) return null;

    // Navigate nested structures
    let cvData = data.processCV || data.data || data;

    if (typeof cvData === 'string') {
      try {
        cvData = JSON.parse(cvData);
      } catch {
        return { raw: cvData };
      }
    }

    return {
      name: cvData.name || cvData.candidate?.name || null,
      email: cvData.email || cvData.candidate?.email || null,
      phone: cvData.phone || cvData.candidate?.phone || null,
      location: cvData.location || cvData.candidate?.location || null,
      skills: cvData.skills || cvData.candidate?.skills || [],
      education: cvData.education || cvData.candidate?.education || [],
      experience: cvData.experience || cvData.candidate?.experience || [],
      summary: cvData.summary || cvData.objective || null,
    };
  }
}

export const cvParserService = new CVParserService();
