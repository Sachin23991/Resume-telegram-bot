import { UserState, UserSessionStore } from '../models/index.js';
import { aiService, cvExtractorService, useResumeService, cvParserService, workflowStoreService, apiLayerService, documentGeneratorService, resumeTemplateService, resumeRendererService } from '../services/index.js';
import { telegramView } from '../views/index.js';

export class CVController {
  resolveIncomingFileType(file, fallbackFileName) {
    const fileName = file?.file_name || fallbackFileName;
    const rawMimeType = file?.mimeType || file?.mime_type || '';
    const lowerFileName = String(fileName || '').toLowerCase();

    if (rawMimeType && rawMimeType !== 'application/octet-stream') {
      return {
        mimeType: rawMimeType === 'image/jpg' ? 'image/jpeg' : rawMimeType,
        fileName,
      };
    }

    if (lowerFileName.endsWith('.docx')) {
      return {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileName,
      };
    }

    if (lowerFileName.endsWith('.doc')) {
      return {
        mimeType: 'application/msword',
        fileName,
      };
    }

    if (lowerFileName.endsWith('.png')) {
      return {
        mimeType: 'image/png',
        fileName,
      };
    }

    if (lowerFileName.endsWith('.jpg') || lowerFileName.endsWith('.jpeg')) {
      return {
        mimeType: 'image/jpeg',
        fileName,
      };
    }

    return {
      mimeType: 'application/pdf',
      fileName,
    };
  }

  buildFullCVParsedData(parsedData, cvText, parserSource) {
    const safeParsedData = parsedData && typeof parsedData === 'object' ? parsedData : {};
    return {
      ...safeParsedData,
      raw_text: cvText,
      full_text: cvText,
      parserSource: parserSource || safeParsedData.parserSource || 'none',
      parsedAsWholeCV: true,
    };
  }

  async parseWholeCVWithFallbacks({ bufferArr, fileName, fileLink, cvText, ctx }) {
    const parserAttempts = [];

    // 1) APILayer
    try {
      console.log('[CVController] Trying APILayer parser (whole CV)...');
      await ctx.reply('📋 Parsing full CV...');
      const parseResult = await apiLayerService.parseResumeFromBuffer(bufferArr, fileName);
      const parsedData = this.buildFullCVParsedData(parseResult.data, cvText, 'apilayer');
      console.log('[CVController] APILayer parsed full CV successfully');
      return { parsedData, parserSource: 'apilayer', parserAttempts };
    } catch (error) {
      parserAttempts.push({ source: 'apilayer', error: error.message });
      console.log('[CVController] APILayer failed, trying next parser:', error.message);
    }

    // 2) CVParser
    try {
      console.log('[CVController] Trying CVParser parser (whole CV)...');
      const parseResult = await cvParserService.parseResume(fileLink.toString());
      const extracted = cvParserService.extractParsedData(parseResult.data);
      const parsedData = this.buildFullCVParsedData(extracted, cvText, 'cvparser');
      console.log('[CVController] CVParser parsed full CV successfully');
      return { parsedData, parserSource: 'cvparser', parserAttempts };
    } catch (error) {
      parserAttempts.push({ source: 'cvparser', error: error.message });
      console.log('[CVController] CVParser failed, trying next parser:', error.message);
    }

    // 3) UseResume
    try {
      console.log('[CVController] Trying UseResume parser (whole CV)...');
      const useResumeResult = await useResumeService.parseResume(bufferArr, fileName);
      const parsedData = this.buildFullCVParsedData(useResumeResult.data, cvText, 'useresume');
      console.log('[CVController] UseResume parsed full CV successfully');
      return { parsedData, parserSource: 'useresume', parserAttempts };
    } catch (error) {
      parserAttempts.push({ source: 'useresume', error: error.message });
      console.log('[CVController] UseResume failed, trying AI parser:', error.message);
    }

    // 4) AI fallback (OpenRouter -> Gemini)
    try {
      console.log('[CVController] Trying AI parser fallback (whole CV)...');
      const aiParsedData = await aiService.extractResumeDataWithOpenRouter(cvText);
      const parsedData = this.buildFullCVParsedData(aiParsedData, cvText, 'ai_fallback');
      console.log('[CVController] AI parser fallback parsed full CV successfully');
      return { parsedData, parserSource: 'ai_fallback', parserAttempts };
    } catch (error) {
      parserAttempts.push({ source: 'ai_fallback', error: error.message });
      console.log('[CVController] All parser providers failed, using extracted full text only');
    }

    // Final fallback: extracted full text only
    const parsedData = this.buildFullCVParsedData({}, cvText, 'text_only_fallback');
    return { parsedData, parserSource: 'text_only_fallback', parserAttempts };
  }

  async handleStart(ctx) {
    const userId = ctx.from.id.toString();
    const session = UserSessionStore.create(userId);
    session.reset();
    await workflowStoreService.upsertStage(userId, 'start', { state: UserState.WAITING_CV });
    await telegramView.welcome(ctx);
    return UserState.WAITING_CV;
  }

  async handleHelp(ctx) {
    await telegramView.help(ctx);
  }

  async handleCancel(ctx) {
    const userId = ctx.from.id.toString();
    UserSessionStore.delete(userId);
    await telegramView.cancel(ctx);
    return UserState.WAITING_CV;
  }

  async handleCV(ctx) {
    const userId = ctx.from.id.toString();
    const session = UserSessionStore.get(userId);

    if (!session) {
      await ctx.reply('Please start with /start');
      return UserState.WAITING_CV;
    }

    const file = ctx.message.document || ctx.message.photo?.[ctx.message.photo.length - 1];

    if (!file) {
      await telegramView.invalidFileType(ctx);
      return UserState.WAITING_CV;
    }

    const resolvedFileType = ctx.message.document
      ? this.resolveIncomingFileType(ctx.message.document, 'resume.pdf')
      : { mimeType: 'image/png', fileName: 'resume.png' };

    const { mimeType, fileName } = resolvedFileType;

    const validTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];
    if (!validTypes.includes(mimeType)) {
      await telegramView.invalidFileType(ctx);
      return UserState.WAITING_CV;
    }

    try {
      const fileLink = await ctx.telegram.getFileLink(file.file_id);
      const response = await fetch(fileLink);
      const buffer = await response.arrayBuffer();
      const bufferArr = Buffer.from(buffer);

      console.log(`[CVController] File downloaded: ${fileName}, size: ${buffer.byteLength} bytes, mimeType: ${mimeType}`);

      // Extract text from CV (FULL TEXT for scoring)
      await ctx.reply('📄 Extracting CV content...');
      const cvText = await cvExtractorService.extractText(bufferArr, mimeType, fileName);

      if (!cvText || cvText.trim().length < 50) {
        await telegramView.cvExtractError(ctx);
        return UserState.WAITING_CV;
      }

      console.log(`[CVController] Extracted text length: ${cvText.length} chars`);

      // Parse full CV with parser fallback chain.
      const parseFlow = await this.parseWholeCVWithFallbacks({
        bufferArr,
        fileName,
        fileLink,
        cvText,
        ctx,
      });
      const finalParsedData = parseFlow.parsedData;
      const parserSource = parseFlow.parserSource;
      const resumeData = resumeTemplateService.buildResumeData(finalParsedData, cvText);

      session.setCV({
        bytes: bufferArr,
        mimeType,
        fileName,
        text: cvText,
        parsedData: finalParsedData,
        resumeData,
      });
      session.setState(UserState.WAITING_JD);
      UserSessionStore.update(userId, session);
      await workflowStoreService.upsertStage(userId, 'cv_uploaded', {
        fileName,
        mimeType,
        parserSource,
        hasParsedData: Boolean(finalParsedData),
        parsedAsWholeCV: true,
        parserAttempts: parseFlow.parserAttempts,
      });

      await telegramView.askForJD(ctx);
      return UserState.WAITING_JD;
    } catch (error) {
      console.error('CV handle error:', error);
      await telegramView.error(ctx, 'Failed to process CV file');
      return UserState.WAITING_CV;
    }
  }

  async handleJobDescription(ctx) {
    const userId = ctx.from.id.toString();
    const session = UserSessionStore.get(userId);

    if (!session || !session.cv) {
      await ctx.reply('Please send your CV first.');
      return UserState.WAITING_CV;
    }

    let jd = '';

    if (ctx.message.text) {
      jd = ctx.message.text;
    } else if (ctx.message.document || ctx.message.photo) {
      try {
        const file = ctx.message.document || ctx.message.photo?.[ctx.message.photo.length - 1];
        const resolvedFileType = ctx.message.document
          ? this.resolveIncomingFileType(ctx.message.document, 'job_description.pdf')
          : { mimeType: 'image/jpeg', fileName: 'job_description.jpg' };

        const { mimeType, fileName } = resolvedFileType;

        const validTypes = [
          'application/pdf',
          'image/png',
          'image/jpeg',
          'image/jpg',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/msword',
        ];
        if (!validTypes.includes(mimeType)) {
          await telegramView.invalidFileType(ctx);
          return UserState.WAITING_JD;
        }

        const fileLink = await ctx.telegram.getFileLink(file.file_id);
        const response = await fetch(fileLink);
        const buffer = await response.arrayBuffer();
        const bufferArr = Buffer.from(buffer);

        await ctx.reply('📋 Extracting job description content...');
        jd = await cvExtractorService.extractText(bufferArr, mimeType, fileName);
      } catch (error) {
        console.error('JD extract error:', error);
        await ctx.reply('Failed to extract text from file. Please paste the job description as text.');
        return UserState.WAITING_JD;
      }
    }

    if (!jd || jd.trim().length < 10) {
      await telegramView.shortJDError(ctx);
      return UserState.WAITING_JD;
    }

    session.setJobDescription(jd);
    session.setState(UserState.PROCESSING);
    UserSessionStore.update(userId, session);

    await telegramView.processing(ctx);

    try {
      // 1. Extract CV structure
      const structure = await aiService.extractStructure(session.cv.text);

      // 2. Get suggestions from AI fallback chain (OpenRouter -> Gemini)
      let suggestionData = {
        strengths: [],
        weaknesses: [],
        improvementSuggestions: [],
        sectionScores: {},
      };

      try {
        suggestionData = await aiService.suggestionsWithGemini(session.cv.text, jd);
      } catch (suggestionsError) {
        console.log('AI suggestions failed:', suggestionsError.message);
      }

      const analysis = {
        ...suggestionData,
        score: 0,
        matchPercentage: 0,
        confidence: 0,
        scoreReason: '',
        keywordMatch: 0,
        contentQuality: 0,
        atsScore: 0,
        structureScore: 0,
        matchedRequirements: [],
        missingRequirements: [],
        criticalErrors: [],
        topFixes: [],
        missingKeywords: [],
      };

      // 3. Get score - ALWAYS use FULL TEXT for scoring (not section-wise).
      // Priority requested: OpenRouter/Gemini AI first, then default fallback if both fail.
      let scoreSource = 'openrouter_gemini';
      const scoringResumeData =
        session.cv.resumeData ||
        resumeTemplateService.buildResumeData(
          session.cv.parsedData || {},
          session.cv.text || ''
        );
      session.cv.resumeData = scoringResumeData;

      // Log what we're using for scoring
      console.log(`[CVController] Scoring with: Full text (${session.cv.text.length} chars) + parsed data context`);

      // Primary: OpenRouter/Gemini using full CV text + parsed context.
      try {
        console.log('[CVController] Trying AI scoring first (OpenRouter/Gemini)...');
        const scorePayload = `${session.cv.text}\n\n[PARSED_FULL_CV_CONTEXT]\n${JSON.stringify(scoringResumeData, null, 2)}`;
        const scoreResult = await aiService.scoreWithParsedData(scorePayload, jd);
        analysis.score = scoreResult.score;
        analysis.matchPercentage = scoreResult.matchPercentage;
        analysis.confidence = scoreResult.confidence ?? 0;
        analysis.scoreReason = scoreResult.scoreReason || '';
        analysis.keywordMatch = scoreResult.keywordMatch ?? analysis.keywordMatch ?? 0;
        analysis.contentQuality = scoreResult.contentQuality ?? analysis.contentQuality ?? 0;
        analysis.atsScore = scoreResult.atsScore ?? analysis.atsScore ?? 0;
        analysis.structureScore = scoreResult.structureScore ?? analysis.structureScore ?? 0;
        analysis.matchedRequirements = scoreResult.matchedRequirements || [];
        analysis.missingRequirements = scoreResult.missingRequirements || [];
        analysis.criticalErrors = scoreResult.criticalErrors || [];
        analysis.topFixes = scoreResult.topFixes || [];
        analysis.missingKeywords = scoreResult.missingKeywords || [];
        if (scoreResult.strengths?.length > 0) analysis.strengths = scoreResult.strengths;
        if (scoreResult.weaknesses?.length > 0) analysis.weaknesses = scoreResult.weaknesses;
        if (scoreResult.improvementSuggestions?.length > 0) analysis.improvementSuggestions = scoreResult.improvementSuggestions;
        console.log(`[CVController] AI scoring succeeded with score: ${analysis.score}`);
      } catch (aiScoreError) {
        console.log('[CVController] AI scoring failed, using default score fallback:', aiScoreError.message);
        analysis.score = 50;
        analysis.matchPercentage = 50;
        scoreSource = 'default';
      }

      // Determine suggestion source based on which scoring path produced the result
      let suggestionSource = 'openrouter_gemini';
      if (scoreSource === 'openrouter_gemini') {
        suggestionSource = 'openrouter_gemini';
      }

      // Store results
      analysis.scoreSource = scoreSource;
      analysis.suggestionSource = suggestionSource;
      analysis.apiScoreUsed = false;

      // Store results
      session.cv.structure = structure;
      session.setAnalysis(analysis);
      session.setState(UserState.WAITING_ACTION_CHOICE);
      UserSessionStore.update(userId, session);
      await workflowStoreService.upsertStage(userId, 'analysis_complete', {
        score: analysis.score,
        scoreSource,
        suggestionSource,
        apiScoreUsed: analysis.apiScoreUsed,
      });

      // Send analysis
      await telegramView.analysisResults(ctx, analysis);

      await telegramView.askImproveCV(ctx);

      return UserState.WAITING_ACTION_CHOICE;
    } catch (error) {
      console.error('Analysis error:', error);
      session.setState(UserState.WAITING_JD);
      UserSessionStore.update(userId, session);
      await telegramView.error(ctx, 'Failed to analyze CV: ' + error.message);
      return UserState.WAITING_JD;
    }
  }

  async handleActionChoice(ctx) {
    const userId = ctx.from.id.toString();
    const session = UserSessionStore.get(userId);

    if (!session) {
      await telegramView.sessionExpired(ctx);
      return UserState.WAITING_CV;
    }

    const choice = ctx.callbackQuery?.data;
    try {
      const callbackQueryId = ctx.callbackQuery?.id;
      if (callbackQueryId && ctx.telegram?.answerCbQuery) {
        await ctx.telegram.answerCbQuery(callbackQueryId);
      }
    } catch (ackError) {
      console.log('[CVController] Failed to acknowledge callback query:', ackError.message);
    }

    if (choice === 'action_none') {
      await telegramView.done(ctx);
      UserSessionStore.delete(userId);
      return UserState.WAITING_CV;
    }

    if (!['action_improve', 'action_cover', 'action_both', 'action_report'].includes(choice)) {
      return UserState.WAITING_ACTION_CHOICE;
    }

    const { cv, jobDescription, analysis } = session;
    const structure = cv.structure;

    try {
      if (choice === 'action_improve') {
        await this.handleImproveResume(ctx, cv.bytes, jobDescription, structure, analysis, session);
      } else if (choice === 'action_cover') {
        await this.handleGenerateCoverLetter(ctx, cv.bytes, jobDescription, session);
      } else if (choice === 'action_both') {
        await this.handleGenerateBoth(ctx, cv.bytes, jobDescription, structure, analysis, session);
      } else if (choice === 'action_report') {
        await this.handleDetailedReport(ctx, analysis, session);
      }
    } catch (error) {
      console.error('Action error:', error);
      await telegramView.actionError(ctx, error.message);
    }

    UserSessionStore.delete(userId);
    return UserState.WAITING_CV;
  }

  async handleImproveResume(ctx, cvBuffer, jobDescription, structure, analysis, session) {
    await telegramView.generatingImprovedResume(ctx);

    try {
      // Get AI-rewritten CV text
      const improvedResumeData = await aiService.rewriteResumeData(
        session.cv.resumeData || session.cv.parsedData || {},
        session.cv.text,
        jobDescription,
        analysis
      );
      session.cv.resumeData = improvedResumeData;

      // Generate PDF/DOCX in the same format as original
      const originalMimeType = session.cv.mimeType;
      const originalFileName = session.cv.fileName;

      await ctx.reply('📄 Generating document in original format...');
      const document = await resumeRendererService.generateResumeDocument(
        improvedResumeData,
        originalMimeType,
        originalFileName,
        session.cv.text
      );

      // Send as file attachment
      await telegramView.sendDocument(ctx, document.buffer, document.fileName, document.mimeType, 'AI Improved Resume');

    } catch (e) {
      console.log('[Controller] AI rewrite failed, trying UseResume:', e.message);
      try {
        const result = await useResumeService.createTailoredResume(cvBuffer, jobDescription, session.cv.fileName, {
          parsedData: session.cv.parsedData,
          resumeText: session.cv.text,
        });
        const runId = result.data?.run_id || result.data?.id || 'unknown';

        if (result.data?.content || result.data?.text || result.data) {
          const generatedResumeData = resumeTemplateService.buildResumeData(
            result.data?.content || result.data?.text || result.data,
            session.cv.text
          );
          session.cv.resumeData = generatedResumeData;

          const document = await resumeRendererService.generateResumeDocument(
            generatedResumeData,
            session.cv.mimeType,
            session.cv.fileName,
            session.cv.text
          );
          await telegramView.sendDocument(ctx, document.buffer, document.fileName, document.mimeType, 'Improved Resume');
        } else {
          await telegramView.improvedResumeComplete(ctx, result.data, runId);
        }
      } catch (e2) {
        console.log('[Controller] UseResume also failed:', e2.message);
        await telegramView.actionError(ctx, 'Failed to generate improved resume');
      }
    }
  }

  async handleGenerateCoverLetter(ctx, cvBuffer, jobDescription, session) {
    await telegramView.generatingCoverLetter(ctx);

    try {
      const coverLetter = await aiService.generateCoverLetterWithOpenRouter(
        session.cv.text,
        jobDescription
      );

      if (!coverLetter || !String(coverLetter).trim()) {
        throw new Error('AI returned empty cover letter');
      }

      const pdfDoc = await documentGeneratorService.generateDocument(
        coverLetter,
        'application/pdf',
        'cover_letter.pdf'
      );

      await telegramView.sendDocument(ctx, pdfDoc.buffer, pdfDoc.fileName, pdfDoc.mimeType, '📝 Cover Letter');

    } catch (e) {
      console.log('[Controller] AI cover letter failed, trying UseResume:', e.message);
      try {
        const result = await useResumeService.createTailoredCoverLetter(cvBuffer, jobDescription, session.cv.fileName, {
          parsedData: session.cv.parsedData,
          resumeText: session.cv.text,
        });
        const runId = result.data?.run_id || result.data?.id || 'unknown';
        const content = this.extractCoverLetterContent(result.data);

        if (content) {
          const pdfDoc = await documentGeneratorService.generateDocument(
            content,
            'application/pdf',
            'cover_letter.pdf'
          );
          await telegramView.sendDocument(ctx, pdfDoc.buffer, pdfDoc.fileName, pdfDoc.mimeType, '📝 Cover Letter');
        } else {
          const generatedDoc = await useResumeService.extractGeneratedDocument(
            result.data,
            'cover_letter.pdf',
            'application/pdf'
          );

          if (generatedDoc?.buffer) {
            await telegramView.sendDocument(
              ctx,
              generatedDoc.buffer,
              generatedDoc.fileName || 'cover_letter.pdf',
              generatedDoc.mimeType || 'application/pdf',
              '📝 Cover Letter'
            );
          } else if (runId !== 'unknown') {
            await telegramView.coverLetterComplete(ctx, runId);
          } else {
            throw new Error('No cover letter content or downloadable file returned by provider');
          }
        }
      } catch (e2) {
        console.log('[Controller] UseResume also failed:', e2.message);
        await telegramView.actionError(ctx, 'Failed to generate cover letter');
      }
    }
  }

  async handleGenerateBoth(ctx, cvBuffer, jobDescription, structure, analysis, session) {
    await telegramView.generatingBoth(ctx);

    try {
      // Generate resume
      const resumeDoc = await this.generateLocalImprovedResume(jobDescription, structure, analysis, session);

      // Generate cover letter
      const coverLetter = await aiService.generateCoverLetterWithOpenRouter(session.cv.text, jobDescription);
      const coverDoc = await documentGeneratorService.generateDocument(
        coverLetter,
        'application/pdf',
        'cover_letter.pdf'
      );

      // Send both files
      await telegramView.sendDocument(ctx, resumeDoc.buffer, resumeDoc.fileName, resumeDoc.mimeType, 'Improved Resume');
      await telegramView.sendDocument(ctx, coverDoc.buffer, coverDoc.fileName, coverDoc.mimeType, '📝 Cover Letter');

    } catch (e) {
      console.log('[Controller] Both generation failed:', e.message);
      await telegramView.actionError(ctx, 'Failed to generate documents: ' + e.message);
    }
  }

  async handleDetailedReport(ctx, analysis, session) {
    await telegramView.generatingReport(ctx);

    const reportLines = [];
    reportLines.push('📊 Detailed Analysis Report');
    reportLines.push('');
    reportLines.push(`Score: ${analysis.score ?? 0}/100`);
    reportLines.push(`Confidence: ${analysis.confidence ?? 0}/100`);
    reportLines.push(`Why: ${analysis.scoreReason || 'No score reason was returned.'}`);
    reportLines.push('');
    reportLines.push(`Keyword Match: ${analysis.keywordMatch ?? 0}%`);
    reportLines.push(`Content Quality: ${analysis.contentQuality ?? 0}%`);
    reportLines.push(`ATS Compatibility: ${analysis.atsScore ?? 0}%`);
    reportLines.push(`Structure & Format: ${analysis.structureScore ?? 0}%`);
    reportLines.push('');

    reportLines.push('ATS Weight Breakdown:');
    reportLines.push('1. Work Experience = 30%');
    reportLines.push('2. Skills & Keywords = 20%');
    reportLines.push('3. Formatting / Parsing = 15%');
    reportLines.push('4. Contact Info = 10%');
    reportLines.push('5. Summary = 10%');
    reportLines.push('6. Education = 10%');
    reportLines.push('7. Language Quality = 5%');
    reportLines.push('');

    if (analysis.matchedRequirements?.length) {
      reportLines.push('Matched Requirements:');
      analysis.matchedRequirements.slice(0, 5).forEach((item, index) => reportLines.push(`${index + 1}. ${item}`));
      reportLines.push('');
    }

    if (analysis.missingRequirements?.length) {
      reportLines.push('Missing Requirements:');
      analysis.missingRequirements.slice(0, 5).forEach((item, index) => reportLines.push(`${index + 1}. ${item}`));
      reportLines.push('');
    }

    if (analysis.criticalErrors?.length) {
      reportLines.push('Critical Errors:');
      analysis.criticalErrors.slice(0, 5).forEach((item, index) => reportLines.push(`${index + 1}. ${item}`));
      reportLines.push('');
    }

    if (analysis.topFixes?.length) {
      reportLines.push('Top Fixes:');
      analysis.topFixes.slice(0, 5).forEach((item, index) => reportLines.push(`${index + 1}. ${item}`));
      reportLines.push('');
    }

    if (analysis.improvementSuggestions?.length) {
      reportLines.push('Priority Improvements:');
      analysis.improvementSuggestions.slice(0, 5).forEach((item, index) => {
        const section = item.section || 'General';
        const suggestion = item.suggested || item.change || '';
        reportLines.push(`${index + 1}. [${section}] ${suggestion}`);
      });
    }

    await telegramView.reportComplete(ctx, reportLines.join('\n'));
    session.setState(UserState.WAITING_ACTION_CHOICE);
  }

  extractCoverLetterContent(data) {
    if (!data || typeof data !== 'object') return null;

    const candidates = [
      data.content,
      data.text,
      data.cover_letter,
      data.coverLetter,
      data.letter,
      data.output,
      data.data?.content,
      data.data?.text,
      data.data?.cover_letter,
      data.data?.coverLetter,
      data.result?.content,
      data.result?.text,
      data.result?.cover_letter,
      data.result?.coverLetter,
    ];

    const found = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
    return found ? found.trim() : null;
  }

  async tryAIThenUseResume(type, cvBuffer, jobDescription, structure, analysis, session) {
    try {
      if (type === 'resume') {
        return await aiService.rewriteCVWithOpenRouter(session.cv.text, jobDescription, structure, analysis);
      } else {
        return await aiService.generateCoverLetterWithOpenRouter(session.cv.text, jobDescription);
      }
    } catch (e) {
      console.log(`[Controller] AI ${type} failed, trying UseResume`);
      if (type === 'resume') {
        const result = await useResumeService.createTailoredResume(cvBuffer, jobDescription, session.cv.fileName, {
          parsedData: session.cv.parsedData,
          resumeText: session.cv.text,
        });
        return result.data;
      } else {
        const result = await useResumeService.createTailoredCoverLetter(cvBuffer, jobDescription, session.cv.fileName, {
          parsedData: session.cv.parsedData,
          resumeText: session.cv.text,
        });
        return result.data;
      }
    }
  }

  shouldPreferUseResumeForFormat(mimeType, fileName) {
    return documentGeneratorService.detectFormat(mimeType, fileName) === 'pdf';
  }

  async generateLocalImprovedResume(jobDescription, structure, analysis, session) {
    const improvedResumeData = await aiService.rewriteResumeData(
      session.cv.resumeData || session.cv.parsedData || {},
      session.cv.text,
      jobDescription,
      analysis
    );
    session.cv.resumeData = improvedResumeData;

    return resumeRendererService.generateResumeDocument(
      improvedResumeData,
      session.cv.mimeType,
      session.cv.fileName,
      session.cv.text
    );
  }

  getState(userId) {
    const session = UserSessionStore.get(userId);
    return session?.state || UserState.WAITING_CV;
  }
}

export const cvController = new CVController();
