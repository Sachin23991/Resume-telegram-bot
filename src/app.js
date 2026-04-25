import http from 'node:http';
import { Telegraf, session } from 'telegraf';
import config from './config/index.js';
import { UserState } from './models/index.js';
import { cvController } from './controllers/index.js';

const bot = new Telegraf(config.telegramBotToken);
const port = Number(process.env.PORT || 10000);

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

// Start command
bot.command('start', runHandler(async (ctx) => {
  await cvController.handleStart(ctx);
}));

// Help command
bot.command('help', runHandler(async (ctx) => {
  await cvController.handleHelp(ctx);
}));

// Cancel command
bot.command('cancel', runHandler(async (ctx) => {
  await cvController.handleCancel(ctx);
}));

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
    await ctx.reply('I am still processing your previous request. Please wait.');
  } else if (state === UserState.WAITING_ACTION_CHOICE) {
    await ctx.reply('Please choose one of the buttons above, or send /start to begin again.');
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
    await ctx.reply('I am still processing your previous request. Please wait.');
  } else if (state === UserState.WAITING_ACTION_CHOICE) {
    await ctx.reply('Please choose one of the buttons above, or send /start to begin again.');
  }
}));

// Handle text messages
bot.on('text', runHandler(async (ctx) => {
  const state = cvController.getState(ctx.from.id.toString());

  if (state === UserState.WAITING_JD) {
    await cvController.handleJobDescription(ctx);
  } else if (state === UserState.WAITING_CV) {
    await ctx.reply('Please send your CV as a PDF, Word document, or image. Send /start to restart.');
  } else if (state === UserState.PROCESSING) {
    await ctx.reply('I am still processing your previous request. Please wait.');
  } else if (state === UserState.WAITING_ACTION_CHOICE) {
    await ctx.reply('Please choose one of the buttons above, or send /start to begin again.');
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
    await ctx.reply('An unexpected error occurred. Please try again.');
  } catch (replyError) {
    console.error('Failed to send bot error reply:', replyError);
  }
});

const server = http.createServer(bot.webhookCallback(`/telegraf/${config.telegramBotToken.split(':')[1]}`));

// Start bot and server
if (process.env.NODE_ENV === 'production') {
  // Production mode: use webhooks
  console.log('Starting CV Analyzer Bot in production mode...');
  const domain = process.env.WEBHOOK_DOMAIN; // Your public domain
  if (!domain) {
    throw new Error('WEBHOOK_DOMAIN environment variable is not set');
  }
  const secretPath = `/telegraf/${bot.secretPathComponent()}`;

  server.listen(port, async () => {
    console.log(`HTTP server listening on port ${port}`);
    await bot.telegram.setWebhook(`https://${domain}${secretPath}`);
    console.log(`Webhook set to https://${domain}${secretPath}`);
  });

  bot.catch((err, ctx) => {
    console.error('Bot error:', err);
  });
} else {
  // Development mode: use long polling
  console.log('Starting CV Analyzer Bot in development mode with long polling...');
  bot.launch()
    .then(() => {
      console.log('Bot is running and listening continuously!');
    })
    .catch((error) => {
      console.error('Failed to launch bot:', error);
      process.exitCode = 1;
    });
}

// Graceful shutdown
process.once('SIGINT', () => {
  bot.stop('SIGINT');
  server.close();
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  server.close();
});
