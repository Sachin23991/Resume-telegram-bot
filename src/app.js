import http from 'node:http';
import { Telegraf, session } from 'telegraf';
import config from './config/index.js';
import { UserState, UserSessionStore } from './models/index.js';
import { cvController } from './controllers/index.js';
import { telegramView } from './views/index.js';

const bot = new Telegraf(config.telegramBotToken);
const port = Number(process.env.PORT || 10000);

// Error handler wrapper
const runHandler = (handler) => async (ctx) => {
  try {
    await handler(ctx);
  } catch (error) {
    console.error('Update handler error:', error);
    try {
      await ctx.reply('An unexpected error occurred. Please try again or send /start.');
    } catch (replyError) {
      console.error('Failed to send error reply:', replyError);
    }
  }
};

// Middleware
bot.use(session());

// ============ COMMAND HANDLERS ============

// Start command - Begin fresh analysis
bot.command('start', runHandler(async (ctx) => {
  await cvController.handleStart(ctx);
}));

// Help command - Show command reference
bot.command('help', runHandler(async (ctx) => {
  await cvController.handleHelp(ctx);
}));

// Menu command - Show main menu
bot.command('menu', runHandler(async (ctx) => {
  await telegramView.menu(ctx);
}));

// End command - Gracefully end session
bot.command('end', runHandler(async (ctx) => {
  const userId = ctx.from.id.toString();
  const session = UserSessionStore.get(userId);

  if (session) {
    // Save to history before ending
    UserSessionStore.delete(userId);
  }

  await telegramView.endSession(ctx);
}));

// History command - Show past analyses
bot.command('history', runHandler(async (ctx) => {
  const userId = ctx.from.id.toString();
  const sessions = UserSessionStore.getHistory(userId);
  await telegramView.history(ctx, sessions);
}));

// Stats command - Show user statistics
bot.command('stats', runHandler(async (ctx) => {
  const userId = ctx.from.id.toString();
  const stats = UserSessionStore.getStats(userId);
  await telegramView.stats(ctx, stats);
}));

// Cancel command - Cancel current operation
bot.command('cancel', runHandler(async (ctx) => {
  await cvController.handleCancel(ctx);
}));

// Version/info command
bot.command('info', runHandler(async (ctx) => {
  await ctx.reply(
    `*CV Analyzer Pro v2.0*

🤖 Intelligent Resume Analysis System

*Features:*
• Multi-provider AI scoring (OpenRouter, Gemini)
• Smart API key rotation with circuit breaker
• 6+ resume parsers with automatic fallback
• ATS-compatible scoring standards
• Improved resume generation
• Cover letter generation
• Session history tracking

*Commands:*
/start - Begin analysis
/menu - Main menu
/help - All commands
/history - Past analyses
/stats - Your statistics
/end - End session

_Send your CV to get started!_`,
    { parse_mode: 'Markdown' }
  );
}));

// ============ MESSAGE HANDLERS ============

// Handle documents (CV and JD files)
bot.on('document', runHandler(async (ctx) => {
  const state = cvController.getState(ctx.from.id.toString());
  if (state === UserState.WAITING_CV || state === UserState.WAITING_JD) {
    if (state === UserState.WAITING_CV) {
      await cvController.handleCV(ctx);
    } else {
      await cvController.handleJobDescription(ctx);
    }
  } else if (state === UserState.PROCESSING) {
    await ctx.reply('⏳ Still processing your previous request. Please wait...');
  } else if (state === UserState.WAITING_ACTION_CHOICE) {
    await ctx.reply('Please choose an option from the buttons above, or use /menu for more commands.');
  } else {
    await ctx.reply('Session ended. Use /start to begin a new analysis.');
  }
}));

// Handle photos (CV and JD images)
bot.on('photo', runHandler(async (ctx) => {
  const state = cvController.getState(ctx.from.id.toString());
  if (state === UserState.WAITING_CV || state === UserState.WAITING_JD) {
    if (state === UserState.WAITING_CV) {
      await cvController.handleCV(ctx);
    } else {
      await cvController.handleJobDescription(ctx);
    }
  } else if (state === UserState.PROCESSING) {
    await ctx.reply('⏳ Still processing your previous request. Please wait...');
  } else if (state === UserState.WAITING_ACTION_CHOICE) {
    await ctx.reply('Please choose an option from the buttons above, or use /menu for more commands.');
  } else {
    await ctx.reply('Session ended. Use /start to begin a new analysis.');
  }
}));

// Handle text messages
bot.on('text', runHandler(async (ctx) => {
  const state = cvController.getState(ctx.from.id.toString());
  const text = ctx.message.text?.toLowerCase() || '';

  // Check for menu triggers
  if (text === 'menu' || text === '/menu') {
    await telegramView.menu(ctx);
    return;
  }

  if (text === 'help' || text === '/help') {
    await cvController.handleHelp(ctx);
    return;
  }

  if (text === 'history') {
    const sessions = UserSessionStore.getHistory(ctx.from.id.toString());
    await telegramView.history(ctx, sessions);
    return;
  }

  if (text === 'stats') {
    const stats = UserSessionStore.getStats(ctx.from.id.toString());
    await telegramView.stats(ctx, stats);
    return;
  }

  if (text === 'end' || text === 'done' || text === 'exit') {
    const userId = ctx.from.id.toString();
    UserSessionStore.delete(userId);
    await telegramView.endSession(ctx);
    return;
  }

  // State-based handling
  if (state === UserState.WAITING_JD) {
    await cvController.handleJobDescription(ctx);
  } else if (state === UserState.WAITING_CV) {
    await ctx.reply(
      '👋 Please send your CV to begin!\n\nSupported formats: PDF, DOCX, PNG, JPG\n\nOr use /menu to see all options.',
      { parse_mode: 'Markdown' }
    );
  } else if (state === UserState.PROCESSING) {
    await ctx.reply('⏳ Please wait while your previous request is being processed...');
  } else if (state === UserState.WAITING_ACTION_CHOICE) {
    await ctx.reply('Please select an option from the buttons above, or type /menu for commands.');
  } else {
    await ctx.reply('Session ended. Use /start to begin a new analysis or /menu for options.');
  }
}));

// Handle callback queries (button clicks)
bot.on('callback_query', runHandler(async (ctx) => {
  await cvController.handleActionChoice(ctx);
}));

// Error handler
bot.catch(async (err, ctx) => {
  console.error('Bot error:', err);
  try {
    await ctx.reply('⚠️ An unexpected error occurred. Please try again or start fresh with /start.');
  } catch (replyError) {
    console.error('Failed to send bot error reply:', replyError);
  }
});

// ============ SERVER SETUP ============

const server = http.createServer(bot.webhookCallback(`/telegraf/${config.telegramBotToken.split(':')[1]}`));

// Start bot and server
if (process.env.NODE_ENV === 'production') {
  // Production mode: use webhooks
  console.log('Starting CV Analyzer Pro in production mode...');
  const domain = process.env.WEBHOOK_DOMAIN;
  if (!domain) {
    throw new Error('WEBHOOK_DOMAIN environment variable is not set');
  }
  const secretPath = `/telegraf/${bot.secretPathComponent()}`;

  server.listen(port, async () => {
    console.log(`HTTP server listening on port ${port}`);
    await bot.telegram.setWebhook(`https://${domain}${secretPath}`);
    console.log(`Webhook set to https://${domain}${secretPath}`);
    console.log('CV Analyzer Pro is ready for production!');
  });

  bot.catch((err, ctx) => {
    console.error('Bot error:', err);
  });
} else {
  // Development mode: use long polling
  console.log('Starting CV Analyzer Pro in development mode...');
  console.log('Bot is running with long polling...');
  bot.launch()
    .then(() => {
      console.log('CV Analyzer Pro is running!');
      console.log('Listening for messages...');
      console.log('Commands: /start, /menu, /help, /end, /history, /stats');
    })
    .catch((error) => {
      console.error('Failed to launch bot:', error);
      process.exitCode = 1;
    });
}

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  bot.stop(signal);
  server.close(() => {
    console.log('✅ Server closed. Goodbye!');
    process.exit(0);
  });
  // Force close after 10 seconds
  setTimeout(() => {
    console.log('⚠️ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
