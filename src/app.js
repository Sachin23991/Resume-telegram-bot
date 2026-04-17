import { Telegraf, session } from 'telegraf';
import config from './config/index.js';
import { UserState } from './models/index.js';
import { cvController } from './controllers/index.js';

const bot = new Telegraf(config.telegramBotToken);

// Middleware
bot.use(session());

// Start command
bot.command('start', async (ctx) => {
  await cvController.handleStart(ctx);
});

// Help command
bot.command('help', async (ctx) => {
  await cvController.handleHelp(ctx);
});

// Cancel command
bot.command('cancel', async (ctx) => {
  await cvController.handleCancel(ctx);
});

// Handle documents (CV and JD files)
bot.on('document', async (ctx) => {
  const state = cvController.getState(ctx.from.id.toString());
  if (state === UserState.WAITING_CV || state === UserState.WAITING_JD) {
    if (state === UserState.WAITING_CV) {
      await cvController.handleCV(ctx);
    } else {
      await cvController.handleJobDescription(ctx);
    }
  }
});

// Handle photos (CV and JD images)
bot.on('photo', async (ctx) => {
  const state = cvController.getState(ctx.from.id.toString());
  if (state === UserState.WAITING_CV || state === UserState.WAITING_JD) {
    if (state === UserState.WAITING_CV) {
      await cvController.handleCV(ctx);
    } else {
      await cvController.handleJobDescription(ctx);
    }
  }
});

// Handle text messages
bot.on('text', async (ctx) => {
  const state = cvController.getState(ctx.from.id.toString());

  if (state === UserState.WAITING_JD) {
    await cvController.handleJobDescription(ctx);
  }
});

// Handle callback queries (button clicks)
bot.on('callback_query', async (ctx) => {
  await cvController.handleActionChoice(ctx);
});

// Error handler
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('An unexpected error occurred. Please try again.');
});

// Start bot
console.log('Starting CV Analyzer Bot...');
console.log('[Boot] Patch marker: callback-ack-v2 + score-parser-v2');
bot.launch().then(() => {
  console.log('Bot is running!');
});

// Graceful shutdown
process.once('SIGINT', () => {
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
});
