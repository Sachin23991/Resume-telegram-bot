export class TelegramView {
  // Helper to escape markdown characters
  escapeMarkdown(text) {
    if (!text) return '';
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
  }

  // Keep dynamic previews short and readable.
  truncateText(text, maxLength = 100) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return 'N/A';
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 1)}...`;
  }

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

  // Format score with visual indicator
  formatScore(score) {
    const filled = Math.round(score / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  // Get score color based on value
  getScoreEmoji(score) {
    if (score >= 85) return '🟢 Excellent';
    if (score >= 70) return '🟡 Good';
    if (score >= 50) return '🟠 Fair';
    return '🔴 Needs Work';
  }

  welcome(ctx) {
    return ctx.reply(
      `👋 *Welcome to CV Analyzer Pro!*

I'm an intelligent resume analyzer that helps you:
• Score your resume match (0-100)
• Find missing keywords & gaps
• Generate improved resumes
• Create tailored cover letters

_Scoring uses industry-standard criteria (ATS compatibility, keyword matching, content quality)_

*📋 Supported Formats:*
• CV: PDF, DOCX, PNG, JPG
• Job Desc: Text, PDF, DOCX

*🔗 Quick Commands:*
/start - Begin analysis
/help - All commands
/history - Your past analyses
/stats - Your statistics
/end - End session cleanly

*Ready? Send your CV to begin!*`,
      { parse_mode: 'Markdown' }
    );
  }

  help(ctx) {
    return ctx.reply(
      `*📚 CV Analyzer Pro - Command Reference*

*Basic Commands:*
/start - Begin a new resume analysis
/end - End current session cleanly
/cancel - Cancel current operation

*Information Commands:*
/help - Show this help menu
/history - View your recent analyses
/stats - View your statistics
/menu - Show the main menu

*💡 How It Works:*
1️⃣ Send your CV (PDF/IMG/DOCX)
2️⃣ Paste job description
3️⃣ Receive detailed analysis (0-100)
4️⃣ Choose what to generate:
   • Improved CV
   • Cover Letter
   • Both documents

*🎯 Scoring Criteria (Industry Standard):*
• Keyword Match (30-40%)
• Content Quality (25-35%)
• ATS Compatibility (20-30%)
• Structure & Formatting (10-15%)

*💬 At any time:*
• Type /menu for main options
• Type /end to stop cleanly
• Type /history to see past work`,
      { parse_mode: 'Markdown' }
    );
  }

  menu(ctx) {
    return ctx.reply(
      `*🎛️ Main Menu*

Select an option to continue:

*Analysis:*
/start - Analyze a new resume
/history - View past analyses
/stats - Your statistics

*Generation:*
🔄 Improve Resume
📝 Generate Cover Letter
📊 Full Analysis Report

*Utility:*
/help - Command reference
/end - End session

_Type any option or command_*`,
      { parse_mode: 'Markdown' }
    );
  }

  endSession(ctx) {
    return ctx.reply(
      `👋 *Session Ended*

Thank you for using CV Analyzer Pro!

*What you can do next:*
• /start - Analyze a new resume
• /history - View past analyses
• /stats - See your statistics

Your previous session data has been securely cleared.

_A new analysis can begin anytime with /start_`,
      { parse_mode: 'Markdown' }
    );
  }

  history(ctx, sessions) {
    if (!sessions || sessions.length === 0) {
      return ctx.reply(
        `📭 *No History Yet*

You haven't completed any resume analyses yet.

_Start your first analysis with /start_`,
        { parse_mode: 'Markdown' }
      );
    }

    let response = `📜 *Your Recent Analyses*\n\n`;
    sessions.forEach((session, idx) => {
      const date = new Date(session.completedAt).toLocaleDateString();
      response += `${idx + 1}. *Score: ${session.score}/100* - ${date}\n`;
      response += `   JD: ${session.jobDescription}...\n`;
      response += `   Parser: ${session.parserSource || 'N/A'} | Source: ${session.scoreSource || 'N/A'}\n\n`;
    });

    response += `\n_Start new analysis with /start_`;
    return ctx.replyWithMarkdown(response);
  }

  stats(ctx, stats) {
    return ctx.reply(
      `📊 *Your Statistics*

*Total Resumes Analyzed:* ${stats.totalAnalyzed || 0}
*Recent Sessions:* ${stats.recentSessions || 0}
*Last Activity:* ${stats.lastActivity ? new Date(stats.lastActivity).toLocaleString() : 'Never'}

_Awaiting more data..._
_Analyze resumes with /start_`,
      { parse_mode: 'Markdown' }
    );
  }

  cancel(ctx) {
    return ctx.reply(
      `❌ *Operation Cancelled*

Your session has been reset.

*Ready for a fresh start:*
• /start - Begin new analysis
• /menu - View all options
• /help - Command reference`,
      { parse_mode: 'Markdown' }
    );
  }

  askForJD(ctx) {
    return ctx.reply(
      `✅ *CV Received & Parsed!*

Now share the *Job Description* to analyze your match.

*You can send it as:*
• Direct text paste (best)
• PDF document
• Word document (.docx)

_The more detailed the JD, the better the analysis_`,
      { parse_mode: 'Markdown' }
    );
  }

  processing(ctx) {
    return ctx.reply(
      `⏳ *Analyzing Your Resume...*

This typically takes 30-60 seconds.

*What's happening:*
🔍 Extracting CV content
📊 Comparing with job requirements
🤖 Running multi-provider AI analysis
📋 Calculating match score

_Please wait, don't send new messages_`,
      { parse_mode: 'Markdown' }
    );
  }

  error(ctx, message) {
    return ctx.reply(`❌ *Error:* ${message}\n\n_Try /start to begin again or /help for assistance_`, { parse_mode: 'Markdown' });
  }

  analysisResults(ctx, analysis) {
    if (analysis.error) {
      return ctx.reply(`❌ Analysis Error: ${analysis.error}`);
    }

    const score = analysis.score ?? 0;
    const scoreSource = analysis.scoreSource || 'AI Analysis';
    const parserSource = analysis.parserSource || 'Unknown';

    // Build comprehensive response
    const scoreBar = this.formatScore(score);
    const scoreLabel = this.getScoreEmoji(score);

    let response = `📊 COMPREHENSIVE ANALYSIS RESULTS\n\n`;

    // Score display
    response += `Your Match Score:\n`;
    response += `${scoreBar} ${score}/100\n`;
    response += `${scoreLabel}\n\n`;

    // Scoring breakdown (industry standard criteria)
    response += `📋 Scoring Breakdown (Top Resume Analyzer Standards):\n`;
    response += `├─ Keyword Match: ${analysis.keywordMatch ?? 'N/A'}%\n`;
    response += `├─ Content Quality: ${analysis.contentQuality ?? 'N/A'}%\n`;
    response += `├─ ATS Compatibility: ${analysis.atsScore ?? 'N/A'}%\n`;
    response += `└─ Structure & Format: ${analysis.structureScore ?? 'N/A'}%\n\n`;

    // Data sources
    response += `🔧 Data Sources:\n`;
    response += `├─ Parser: ${parserSource}\n`;
    response += `└─ Analysis: ${scoreSource}\n\n`;

    if (analysis.scoreReason) {
      response += `🧠 Why this score:\n`;
      response += `${analysis.scoreReason}\n\n`;
    }

    if (analysis.confidence !== undefined) {
      response += `📍 Confidence: ${analysis.confidence}/100\n\n`;
    }

    if (analysis.matchedRequirements && analysis.matchedRequirements.length > 0) {
      response += `✅ Matched Requirements:\n`;
      analysis.matchedRequirements.slice(0, 5).forEach((item, i) => {
        response += `${i + 1}. ${item}\n`;
      });
      response += `\n`;
    }

    if (analysis.missingRequirements && analysis.missingRequirements.length > 0) {
      response += `⚠️ Missing Requirements:\n`;
      analysis.missingRequirements.slice(0, 5).forEach((item, i) => {
        response += `${i + 1}. ${item}\n`;
      });
      response += `\n`;
    }

    if (analysis.criticalErrors && analysis.criticalErrors.length > 0) {
      response += `❗ Critical Errors:\n`;
      analysis.criticalErrors.slice(0, 5).forEach((item, i) => {
        response += `${i + 1}. ${item}\n`;
      });
      response += `\n`;
    }

    if (analysis.topFixes && analysis.topFixes.length > 0) {
      response += `🛠️ Top Fixes:\n`;
      analysis.topFixes.slice(0, 5).forEach((item, i) => {
        response += `${i + 1}. ${item}\n`;
      });
      response += `\n`;
    }

    // Strengths
    if (analysis.strengths && analysis.strengths.length > 0) {
      response += `✅ Your Strengths:\n`;
      analysis.strengths.slice(0, 5).forEach((s, i) => {
        response += `${i + 1}. ${s}\n`;
      });
      response += `\n`;
    }

    // Missing keywords
    if (analysis.missingKeywords && analysis.missingKeywords.length > 0) {
      response += `❌ Missing Keywords:\n`;
      response += analysis.missingKeywords.slice(0, 10).join(', ') + `\n\n`;
    }

    // Key improvements
    if (analysis.improvementSuggestions && analysis.improvementSuggestions.length > 0) {
      response += `💡 Priority Improvements:\n`;
      analysis.improvementSuggestions.slice(0, 3).forEach((s, i) => {
        const section = s.section || 'General';
        const suggestion = (s.suggested || s.change || '').slice(0, 60);
        response += `${i + 1}. [${section}] ${suggestion}...\n`;
      });
    }

    response += `\nUse /menu for options or continue below`;
    return ctx.reply(response);
  }

  askImproveCV(ctx) {
    return ctx.reply(
      `*✨ What's Next?*

Select an action below:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📄 Improve My Resume', callback_data: 'action_improve' },
              { text: '📝 Create Cover Letter', callback_data: 'action_cover' },
            ],
            [
              { text: '🔄 Both Documents', callback_data: 'action_both' },
              { text: '📊 Detailed Report', callback_data: 'action_report' },
            ],
            [
              { text: '🔍 Compare with Another JD', callback_data: 'action_compare' },
              { text: '✅ Done - End Session', callback_data: 'action_none' },
            ],
          ],
        },
      }
    );
  }

  generatingImprovedResume(ctx) {
    return ctx.reply(
      `✨ *Generating Improved Resume...*

This creates a tailored resume with:
• Better keyword alignment
• Improved descriptions
• ATS-friendly formatting

_May take 30-60 seconds..._`,
      { parse_mode: 'Markdown' }
    );
  }

  generatingCoverLetter(ctx) {
    return ctx.reply(
      `📝 *Generating Cover Letter...*

Creating a professional, tailored letter:
• Highlighting relevant skills
• Matching job requirements
• Professional tone

_May take 30-60 seconds..._`,
      { parse_mode: 'Markdown' }
    );
  }

  generatingBoth(ctx) {
    return ctx.reply(
      `🔄 *Generating Both Documents...*

Creating improved resume AND cover letter:
• Resume with keyword optimization
• Cover letter tailored to role

_This may take up to 2 minutes..._`,
      { parse_mode: 'Markdown' }
    );
  }

  generatingReport(ctx) {
    return ctx.reply(
      `📊 *Generating Detailed Report...*

Compiling comprehensive analysis:
• Full scoring breakdown
• Section-by-section analysis
• Industry comparison
• Actionable recommendations

_Please wait..._`,
      { parse_mode: 'Markdown' }
    );
  }

  improvedResumeComplete(ctx, resumeData, runId) {
    return ctx.reply(
      `✅ *Improved Resume Ready!*

Your resume has been optimized with:
• Better keyword matching
• Improved action verbs
• Quantified achievements
• ATS-friendly format

${runId ? `Run ID: \`${runId}\`` : ''}

📎 *Document attached above*

*Next steps:*
• /start - Analyze another CV
• /history - View this analysis
• /menu - Main menu`,
      { parse_mode: 'Markdown' }
    );
  }

  coverLetterComplete(ctx, runId) {
    return ctx.reply(
      `✅ *Cover Letter Ready!*

Your professional cover letter includes:
• Strong opening paragraph
• Key skill highlights
• Role-specific alignment
• Call to action

${runId ? `Run ID: \`${runId}\`` : ''}

📎 *Document attached above*

*Next steps:*
• /start - Analyze another CV
• /history - View this analysis
• /menu - Main menu`,
      { parse_mode: 'Markdown' }
    );
  }

  reportComplete(ctx, reportData) {
    const chunks = this.splitMessage(reportData, 4000);
    ctx.replyWithMarkdown(`📊 *Detailed Analysis Report*\n\n${chunks[0]}`).then(() => {
      chunks.slice(1).forEach((chunk) => ctx.replyWithMarkdown(chunk));
    });
    return ctx.reply(
      `_Report generated. /start for new analysis or /menu for options_`,
      { parse_mode: 'Markdown' }
    );
  }

  aiCoverLetter(ctx, coverLetter) {
    const chunks = this.splitMessage(coverLetter, 4000);
    ctx.replyWithMarkdown(`📝 *AI Generated Cover Letter*\n\n${chunks[0]}`).then(() => {
      chunks.slice(1).forEach((chunk) => ctx.replyWithMarkdown(chunk));
    });
    return ctx.reply(`_Generated by AI. /start for new analysis or /menu for options_`, { parse_mode: 'Markdown' });
  }

  aiRewrittenCV(ctx, cvText) {
    const chunks = this.splitMessage(cvText, 4000);
    ctx.replyWithMarkdown(`📄 *AI Improved Resume*\n\n${chunks[0]}`).then(() => {
      chunks.slice(1).forEach((chunk) => ctx.replyWithMarkdown(chunk));
    });
    return ctx.reply(`_Generated by AI. /start for new analysis or /menu for options_`, { parse_mode: 'Markdown' });
  }

  bothComplete(ctx, resumeResult, coverResult) {
    let response = `✅ *Documents Generated!*\n\n`;

    if (resumeResult && typeof resumeResult === 'string') {
      const chunks = this.splitMessage(resumeResult, 3500);
      ctx.replyWithMarkdown(`📄 *Improved Resume:*\n\n${chunks[0]}`).then(() => {
        chunks.slice(1).forEach((chunk) => ctx.replyWithMarkdown(chunk));
      });
    } else if (resumeResult?.run_id || resumeResult?.id) {
      response += `📄 *Improved Resume:* Run ID \`${resumeResult.run_id || resumeResult.id}\`\n`;
    }

    if (coverResult && typeof coverResult === 'string') {
      const chunks = this.splitMessage(coverResult, 3500);
      ctx.replyWithMarkdown(`📝 *Cover Letter:*\n\n${chunks[0]}`).then(() => {
        chunks.slice(1).forEach((chunk) => ctx.replyWithMarkdown(chunk));
      });
    } else if (coverResult?.run_id || coverResult?.id) {
      response += `📝 *Cover Letter:* Run ID \`${coverResult.run_id || coverResult.id}\`\n`;
    }

    response += `\n*Next steps:*\n`;
    response += `• /start - New analysis\n`;
    response += `• /history - View results\n`;
    response += `• /menu - Main menu`;

    return ctx.replyWithMarkdown(response);
  }

  compareResume(ctx) {
    return ctx.reply(
      `🔍 *Compare with Another JD*

Send a new job description to compare against your current resume.

_This will show how your resume matches multiple roles_`,
      { parse_mode: 'Markdown' }
    );
  }

  sessionExpired(ctx) {
    return ctx.reply(
      `⏰ *Session Expired*

Your session has timed out (1 hour inactive).

_Data has been securely cleared._

_Start fresh with /start_`,
      { parse_mode: 'Markdown' }
    );
  }

  done(ctx) {
    return ctx.reply(
      `👍 *Session Complete!*

Thank you for using CV Analyzer Pro.

*Summary of what was done:*
• Resume analyzed
• Match score calculated
• Suggestions provided

*Ready when you are:*
• /start - Analyze new resume
• /history - View past work
• /stats - Your statistics`,
      { parse_mode: 'Markdown' }
    );
  }

  feedbackPrompt(ctx) {
    return ctx.reply(
      `📝 *Quick Feedback*

How was your experience?

*Rate your satisfaction:*
1 - Poor
2 - Fair
3 - Good
4 - Very Good
5 - Excellent

Or type your comments/suggestions.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '1️⃣ Poor', callback_data: 'feedback_1' }, { text: '2️⃣ Fair', callback_data: 'feedback_2' }],
            [{ text: '3️⃣ Good', callback_data: 'feedback_3' }, { text: '4️⃣ Very Good', callback_data: 'feedback_4' }],
            [{ text: '5️⃣ Excellent', callback_data: 'feedback_5' }],
          ],
        },
      }
    );
  }

  feedbackResponse(ctx, rating) {
    const responses = {
      1: '😞 Sorry to hear that. We\'ll work to improve.',
      2: '😐 Noted. There\'s room for improvement.',
      3: '🙂 Thanks! We aim to get better.',
      4: '😊 Great to hear! Keep using us.',
      5: '🌟 Excellent! Thank you for the support!',
    };
    return ctx.reply(
      `${responses[rating] || '📝 Feedback recorded.'}

*What would help us improve?*
• /start - Try again
• /help - Get support
• /menu - Main menu`,
      { parse_mode: 'Markdown' }
    );
  }

  invalidFileType(ctx) {
    return ctx.reply(
      `❌ *Unsupported File Format*

Please send:
• PDF (.pdf)
• Word (.docx)
• Image (PNG, JPG)

_Type /help for more information_`,
      { parse_mode: 'Markdown' }
    );
  }

  shortJDError(ctx) {
    return ctx.reply(
      `❌ *Job Description Too Short*

Please provide more detail (at least 50 characters).

A good JD includes:
• Required skills
• Job responsibilities
• Qualifications

_Try pasting a longer description_`,
      { parse_mode: 'Markdown' }
    );
  }

  cvExtractError(ctx) {
    return ctx.reply(
      `❌ *Could Not Extract CV Content*

The file appears to be:
• Corrupted or password-protected
• An unsupported format
• Too low quality to parse

*Please try:*
• A clearer PDF scan
• A higher resolution image
• A standard Word document

_/start to try again_`,
      { parse_mode: 'Markdown' }
    );
  }

  actionError(ctx, error) {
    return ctx.reply(
      `❌ *Action Failed:* ${error}

*Try these options:*
• /start - Begin fresh
• /menu - Main menu
• /help - Get support`,
      { parse_mode: 'Markdown' }
    );
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
      const text = buffer.toString('utf-8').slice(0, 4000);
      await ctx.reply(`${caption}\n\n${text}`);
    }
  }

  runStatus(ctx, status) {
    return ctx.reply(`📋 Run Status: ${status}`, { parse_mode: 'Markdown' });
  }

  // Send typing indicator for better UX
  sending(ctx) {
    return ctx.reply('...');
  }
}

export const telegramView = new TelegramView();
