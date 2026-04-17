import 'dotenv/config';

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiEnabled = Boolean(openaiApiKey && !openaiApiKey.startsWith('sk-or-'));

export default {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,

  // Database
  mongodbUrl: process.env.MONGODB_URL,
  mongodbDbName: process.env.MONGODB_DB_NAME,

  // AI APIs
  geminiApiKey: process.env.GEMINI_API_KEY,
  openaiApiKey,
  openaiEnabled,

  // OpenRouter API Keys (rotation + fallback)
  openrouterKeys: [
    process.env.OPENROUTER_KEY_1,
    process.env.OPENROUTER_KEY_2,
    process.env.OPENROUTER_KEY_3,
  ].filter(Boolean),
  openrouterKeyFallback: process.env.OPENROUTER_KEY_FALLBACK,

  // APILayer Resume Parser Keys (4 keys)
  apilayerKeys: [
    process.env.APILAYER_KEY_1,
    process.env.APILAYER_KEY_2,
    process.env.APILAYER_KEY_3,
    process.env.APILAYER_KEY_4,
  ].filter(Boolean),

  // Affinda API Keys (4 keys) - for resume matching/scoring
  affindaKeys: [
    process.env.AFFINDA_KEY_1,
    process.env.AFFINDA_KEY_2,
    process.env.AFFINDA_KEY_3,
    process.env.AFFINDA_KEY_4,
  ].filter(Boolean),

  // Resume Score API Keys (ApyHub - 4 keys with fallback) - backup
  resumeScoreKeys: [
    process.env.RESUME_SCORE_KEY_1,
    process.env.RESUME_SCORE_KEY_2,
    process.env.RESUME_SCORE_KEY_3,
    process.env.RESUME_SCORE_KEY_4,
  ].filter(Boolean),

  // UseResume API Keys (3 keys with fallback)
  useResumeKeys: [
    process.env.USERESUME_KEY_1,
    process.env.USERESUME_KEY_2,
    process.env.USERESUME_KEY_3,
  ].filter(Boolean),

  // CVParser API Keys (4 keys with fallback)
  cvParserKeys: [
    process.env.CVPARSER_KEY_1,
    process.env.CVPARSER_KEY_2,
    process.env.CVPARSER_KEY_3,
    process.env.CVPARSER_KEY_4,
  ].filter(Boolean),

  // CVParser API URL
  cvParserApiUrl: process.env.CVPARSER_API_URL || 'https://api.cvparser-api.com/graphql',
};
