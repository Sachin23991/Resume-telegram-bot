export class TelegramView {
  // Helper method to split long messages for Telegram (max 4096 chars per message)
  splitMessage(text, maxLength = 4000) {
    if (!text || typeof text !== 'string') {
      return [''];
    }
    if (text.length <= maxLength) {
      return [text];
    }
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }
      // Try to find a good break point (newline or space)
      let breakPoint = remaining.lastIndexOf('\n', maxLength);
      if (breakPoint === -1 || breakPoint < maxLength * 0.5) {
        breakPoint = remaining.lastIndexOf(' ', maxLength);
      }
      if (breakPoint === -1 || breakPoint < maxLength * 0.5) {
        breakPoint = maxLength;
      }
      chunks.push(remaining.slice(0, breakPoint));
      remaining = remaining.slice(breakPoint).trim();
    }
    return chunks;
  }

  welcome(ctx) {
    return ctx.reply(
      `👋 *Welcome to CV Analyzer Bot!*\n\n` +
      `I help you analyze, score, and improve your resume against any job description.\n\n` +
      `*What I can do:*\n` +
      `📊 Score your CV match (0-100)\n` +
      `🔍 Find missing keywords\n` +
      `💡 Suggest improvements\n` +
      `✨ Create improved resume\n` +
      `📝 Generate cover letter\n\n` +
      `*Supported formats:*\n` +
      `📄 CV: PDF, Word (.docx), PNG, JPG\n` +
      `📋 Job Description: PDF, Word (.docx), Text\n\n` +
      `Send /help for commands.\n\n` +
      `*To get started, send me your CV!*`
    );
  }

  help(ctx) {
    return ctx.reply(
      `*CV Analyzer Bot - Commands*\n\n` +
      `/start - Restart bot\n` +
      `/help - Show this help\n` +
      `/cancel - Cancel current operation\n\n` +
      `*Supported Formats:*\n` +
      `📄 CV: PDF, Word (.docx), PNG, JPG\n` +
      `📋 Job Description: PDF, Word (.docx), Text\n\n` +
      `*How it works:*\n` +
      `1. Send your CV\n` +
      `2. Send job description\n` +
      `3. Get analysis & score\n` +
      `4. Choose: Improved CV / Cover Letter / Both / Done`
    );
  }

  cancel(ctx) {
    return ctx.reply('❌ Cancelled. Send /start to begin again.');
  }

  askForJD(ctx) {
    return ctx.reply(
      `✅ *CV Received!*\n\n` +
      `Now send me the *job description*.\n\n` +
      `You can send:\n` +
      `• Paste text directly\n` +
      `• Send a PDF file\n` +
      `• Send a Word document (.docx)`
    );
  }

  processing(ctx) {
    return ctx.reply('⏳ *Analyzing your CV...*\n\nThis may take 30-60 seconds.');
  }

  error(ctx, message) {
    return ctx.reply(`❌ Error: ${message}`);
  }

  analysisResults(ctx, analysis, apiScore) {
    if (analysis.error) {
      return ctx.reply(`❌ Analysis Error: ${analysis.error}`);
    }

    const score = apiScore ?? analysis.score;
    const scoreSource = apiScore !== null ? '🔗 Resume Match API' : '🤖 AI Analysis';

    // Determine score tier and message
    let scoreMessage = '';
    if (score >= 80) {
      scoreMessage = '🎯 Great match! Your CV aligns well with this job.';
    } else if (score >= 60) {
      scoreMessage = '📊 Decent match. Some improvements could help you stand out.';
    } else if (score >= 40) {
      scoreMessage = '⚠️ Low match. Significant improvements recommended.';
    } else {
      scoreMessage = '🔴 Poor match. Major revisions needed to be competitive.';
    }

    let response = `📊 *Analysis Results*\n\n`;
    response += `*Match Score:* ${score}/100 (${scoreSource})\n`;
    response += `${scoreMessage}\n\n`;

    if (analysis.strengths && analysis.strengths.length > 0) {
      response += `✅ *Strengths:*\n`;
      analysis.strengths.slice(0, 4).forEach((s) => {
        response += `• ${s}\n`;
      });
      response += `\n`;
    }

    if (analysis.missingKeywords && analysis.missingKeywords.length > 0) {
      const missing = analysis.missingKeywords.slice(0, 8);
      response += `❌ *Missing Keywords:*\n`;
      response += missing.join(', ') + `\n\n`;
    }

    if (analysis.improvementSuggestions && analysis.improvementSuggestions.length > 0) {
      response += `💡 *Key Improvements Suggested:*\n`;
      analysis.improvementSuggestions.slice(0, 3).forEach((s, i) => {
        const section = s.section || 'General';
        response += `${i + 1}. [${section}] ${(s.suggested || '').slice(0, 80)}...\n`;
      });
    }

    return ctx.replyWithMarkdown(response);
  }

  askImproveCV(ctx) {
    return ctx.reply(
      `*✨ Would you like me to generate an improved CV with these corrections?*\n\n` +
      `This will apply the suggested improvements to your resume.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Yes, Generate Improved CV', callback_data: 'action_improve' },
              { text: '📝 Generate Cover Letter Instead', callback_data: 'action_cover' },
            ],
            [
              { text: '🔄 Both Improved CV + Cover Letter', callback_data: 'action_both' },
              { text: '❌ No, I\'m Done', callback_data: 'action_none' },
            ],
          ],
        },
      }
    );
  }

  generatingImprovedResume(ctx) {
    return ctx.reply('✨ *Generating improved resume...*\n\nThis uses the default template with your improved content.');
  }

  generatingCoverLetter(ctx) {
    return ctx.reply('📝 *Generating cover letter...*\n\nThis will be tailored to the job description.');
  }

  generatingBoth(ctx) {
    return ctx.reply('🔄 *Generating resume & cover letter...*\n\nThis may take a minute.');
  }

  improvedResumeComplete(ctx, resumeData, runId) {
    return ctx.reply(
      `✅ *Improved Resume Ready!*\n\n` +
      `Your resume has been improved with:\n` +
      `• Better keyword matching\n` +
      `• Improved descriptions\n` +
      `• Default template formatting\n\n` +
      `Run ID: \`${runId}\`\n\n` +
      `Review the generated document and reuse the same flow for another CV with /start.\n\n` +
      `Send /start to analyze another CV.`,
      { parse_mode: 'Markdown' }
    );
  }

  coverLetterComplete(ctx, runId) {
    return ctx.reply(
      `✅ *Cover Letter Ready!*\n\n` +
      `Tailored specifically for this job description.\n\n` +
      `Run ID: \`${runId}\`\n\n` +
      `Download from UseResume!\n\n` +
      `Send /start to analyze another CV.`,
      { parse_mode: 'Markdown' }
    );
  }

  aiCoverLetter(ctx, coverLetter) {
    const chunks = this.splitMessage(coverLetter, 4000);
    ctx.replyWithMarkdown(`✨ *AI Generated Cover Letter:*\n\n${chunks[0]}`).then(() => {
      chunks.slice(1).forEach((chunk) => ctx.replyWithMarkdown(chunk));
    });
    return ctx.reply(`Send /start to analyze another CV.`);
  }

  aiRewrittenCV(ctx, cvText) {
    const chunks = this.splitMessage(cvText, 4000);
    ctx.replyWithMarkdown(`✨ *AI Improved Resume:*\n\n${chunks[0]}`).then(() => {
      chunks.slice(1).forEach((chunk) => ctx.replyWithMarkdown(chunk));
    });
    return ctx.reply(`Send /start to analyze another CV.`);
  }

  bothComplete(ctx, resumeResult, coverResult) {
    let response = `✅ *Documents Ready!*\n\n`;

    if (resumeResult && typeof resumeResult === 'string') {
      // AI generated resume
      const chunks = this.splitMessage(resumeResult, 3500);
      ctx.replyWithMarkdown(`📄 *Improved Resume:*\n\n${chunks[0]}`).then(() => {
        chunks.slice(1).forEach((chunk) => ctx.replyWithMarkdown(chunk));
      });
    } else if (resumeResult?.run_id || resumeResult?.id) {
      response += `📄 *Improved Resume:* Run ID \`${resumeResult.run_id || resumeResult.id}\`\n`;
    } else if (resumeResult) {
      response += `📄 *Improved Resume:* AI generated (see above)\n`;
    } else {
      response += `📄 *Improved Resume:* Failed\n`;
    }

    if (coverResult && typeof coverResult === 'string') {
      // AI generated cover letter
      const chunks = this.splitMessage(coverResult, 3500);
      ctx.replyWithMarkdown(`📝 *Cover Letter:*\n\n${chunks[0]}`).then(() => {
        chunks.slice(1).forEach((chunk) => ctx.replyWithMarkdown(chunk));
      });
    } else if (coverResult?.run_id || coverResult?.id) {
      response += `📝 *Cover Letter:* Run ID \`${coverResult.run_id || coverResult.id}\`\n`;
    } else if (coverResult) {
      response += `📝 *Cover Letter:* AI generated (see above)\n`;
    } else {
      response += `📝 *Cover Letter:* Failed\n`;
    }

    response += `\nSend /start to analyze another CV.`;
    return ctx.replyWithMarkdown(response);
  }

  sessionExpired(ctx) {
    return ctx.reply('⏰ Session expired. Please start over with /start');
  }

  done(ctx) {
    return ctx.reply('👍 Done! Send /start to analyze another CV.');
  }

  invalidFileType(ctx) {
    return ctx.reply('❌ Please send a PDF, Word document (.docx), or image file (PNG, JPG).');
  }

  shortJDError(ctx) {
    return ctx.reply('❌ Job description too short. Please provide more details (at least 10 characters).');
  }

  cvExtractError(ctx) {
    return ctx.reply('❌ Could not extract text from CV. Please try a clearer document.');
  }

  actionError(ctx, error) {
    return ctx.reply(`❌ Action failed: ${error}\n\nTry /start to begin again.`);
  }

  async sendDocument(ctx, buffer, fileName, mimeType, caption = '') {
    const normalizedFileName = String(fileName || '').toLowerCase();
    const normalizedCaption = String(caption || '').toLowerCase();
    const isDefaultTemplateFile =
      normalizedFileName.includes('_default_template.') ||
      normalizedCaption.includes('default template cv');

    if (isDefaultTemplateFile) {
      console.log('[TelegramView] Skipping default template document send.');
      return;
    }

    try {
      await ctx.replyWithDocument(
        {
          source: buffer,
          filename: fileName,
        },
        {
          caption: caption,
          parse_mode: 'Markdown',
        }
      );
    } catch (error) {
      console.error('[TelegramView] Failed to send document:', error.message);
      // Fallback: send as text if document fails
      const text = buffer.toString('utf-8').slice(0, 4000);
      await ctx.reply(`${caption}\n\n${text}`);
    }
  }

  runStatus(ctx, status) {
    return ctx.reply(`📋 Run Status: ${status}`);
  }
}

export const telegramView = new TelegramView();
