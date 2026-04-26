import 'dotenv/config';

export default {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,

  // Database
  mongodbUrl: process.env.MONGODB_URL,
  mongodbDbName: process.env.MONGODB_DB_NAME,

  // AI APIs
  geminiApiKey: process.env.GEMINI_API_KEY,

  // OpenRouter API Keys (rotation + fallback)
  openrouterKeys: [
    process.env.OPENROUTER_KEY_1,
    process.env.OPENROUTER_KEY_2,
    process.env.OPENROUTER_KEY_3,
  ].filter(Boolean),
  openrouterKeyFallback: process.env.OPENROUTER_KEY_FALLBACK,
  openrouterModel: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash',

  // APILayer Resume Parser Keys (4 keys)
  apilayerKeys: [
    process.env.APILAYER_KEY_1,
    process.env.APILAYER_KEY_2,
    process.env.APILAYER_KEY_3,
    process.env.APILAYER_KEY_4,
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
