import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, BorderStyle } from 'docx';
import { Buffer } from 'buffer';

export class DocumentGeneratorService {
  /**
   * Generate a PDF from resume text with proper formatting
   */
  async generatePDF(resumeText, originalFileName = 'resume') {
    return new Promise((resolve, reject) => {
      try {
        const chunks = [];
        const doc = new PDFDocument({
          margin: 40,
          size: 'A4',
          info: {
            Title: originalFileName.replace(/\.[^/.]+$/, ''),
          },
        });

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Parse resume into structured sections
        const resume = this.parseResumeStructure(resumeText);

        // Header - Name
        doc.fontSize(18).font('Helvetica-Bold').text(resume.name || 'Resume', { align: 'center' });
        doc.moveDown(0.3);

        // Contact info - on one line with separators
        const contactParts = [];
        if (resume.email) contactParts.push(resume.email);
        if (resume.phone) contactParts.push(resume.phone);
        if (resume.linkedin) contactParts.push(resume.linkedin);
        if (resume.github) contactParts.push(resume.github);

        if (contactParts.length > 0) {
          doc.fontSize(9).font('Helvetica').text(contactParts.join(' | '), { align: 'center' });
        }
        doc.moveDown(0.5);

        // Draw a line separator
        doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
        doc.moveDown(0.5);

        // Process each section
        for (const section of resume.sections) {
          // Check if we need a new page
          if (doc.y > 700) {
            doc.addPage();
          }

          // Section header
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#2563eb').text(section.title.toUpperCase());
          doc.moveDown(0.2);

          // Draw underline for section header
          doc.moveTo(40, doc.y).lineTo(150, doc.y).stroke('#2563eb');
          doc.moveDown(0.3);

          // Section content
          doc.fontSize(10).font('Helvetica').fillColor('black');

          if (section.type === 'skills') {
            // Skills - compact format
            for (const skillGroup of section.items) {
              doc.text(skillGroup, { indent: 20 });
            }
          } else if (section.type === 'experience' || section.type === 'projects') {
            // Experience/Projects - structured format
            for (const item of section.items) {
              if (doc.y > 720) doc.addPage();

              // Title and date on same line
              if (item.title) {
                const titleText = item.title;
                const dateText = item.dates || '';

                const lineY = doc.y;
                doc.font('Helvetica-Bold').text(titleText, 40, lineY, { width: 360 });
                if (dateText) {
                  doc.font('Helvetica').text(dateText, 430, lineY, { width: 125, align: 'right' });
                }
                doc.y = Math.max(doc.y, lineY + 13);
              }

              // Company/location
              if (item.company) {
                doc.font('Helvetica-Oblique').text(item.company + (item.location ? ' | ' + item.location : ''), { indent: 0 });
              }

              // Description
              if (item.description) {
                doc.font('Helvetica').text(item.description, { indent: 0 });
              }

              // Bullet points
              if (item.bullets && item.bullets.length > 0) {
                for (const bullet of item.bullets) {
                  doc.font('Helvetica').text('- ' + bullet, { indent: 18, width: 495 });
                }
              }

              // Tech stack
              if (item.techStack) {
                doc.font('Helvetica-Oblique').fontSize(9).text('Tech Stack: ' + item.techStack, { indent: 0 });
              }

              doc.moveDown(0.3);
              doc.fontSize(10);
            }
          } else if (section.type === 'education') {
            // Education
            for (const item of section.items) {
              if (doc.y > 720) doc.addPage();

              const lineY = doc.y;
              doc.font('Helvetica-Bold').text(item.institution || '', 40, lineY, { width: 360 });
              doc.font('Helvetica').text(item.dates || '', 430, lineY, { width: 125, align: 'right' });
              doc.y = Math.max(doc.y, lineY + 13);

              if (item.degree) {
                doc.font('Helvetica-Oblique').text(item.degree, { indent: 0 });
              }
              doc.moveDown(0.3);
            }
          } else {
            // Default - just text
            for (const item of section.items) {
              if (typeof item === 'string') {
                doc.text(item, { indent: 20 });
              }
            }
          }

          doc.moveDown(0.3);
        }

        doc.end();
      } catch (error) {
        console.error('[DocumentGenerator] PDF generation error:', error);
        reject(error);
      }
    });
  }

  /**
   * Parse resume text into structured format
   */
  parseResumeStructure(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    const resume = {
      name: '',
      email: '',
      phone: '',
      linkedin: '',
      github: '',
      sections: [],
    };

    // Known section headers (case insensitive matching)
    const sectionPatterns = {
      skills: /^(skills?|technical\s*skills?|technologies|tools|competencies)$/i,
      experience: /^(work\s*experience|professional\s*experience|experience|work\s*history|employment)$/i,
      projects: /^(projects?|personal\s*projects?|key\s*projects?)$/i,
      education: /^(education|academic\s*background|qualifications?)$/i,
      certifications: /^(certifications?|certificates?|courses?)$/i,
      achievements: /^(achievements?|awards?|honors?|accomplishments?)$/i,
      training: /^(training|internships?|courses?)$/i,
      languages: /^(languages?|language\s*skills?)$/i,
      summary: /^(summary|objective|profile|about\s*me|professional\s*summary)$/i,
    };

    let currentSection = null;
    let currentItem = null;

    // First pass - extract header info (name, contact)
    let headerEndIndex = 0;

    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const line = lines[i];

      // Skip if it's a section header
      if (Object.values(sectionPatterns).some(pattern => pattern.test(line))) {
        headerEndIndex = i;
        break;
      }

      // First non-contact line is usually the name
      if (!resume.name && !line.includes('@') && !line.includes('http') &&
          !line.includes('+') && !line.includes('|') && line.length > 0 && line.length < 60) {
        resume.name = line;
        continue;
      }

      // Extract contact info
      const emailMatch = line.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (emailMatch) resume.email = emailMatch[0];

      const phoneMatch = line.match(/\+?[\d\s-]{8,}/);
      if (phoneMatch) resume.phone = phoneMatch[0].trim();

      const linkedinMatch = line.match(/linkedin\.com\/in\/[\w-]+/i);
      if (linkedinMatch) resume.linkedin = linkedinMatch[0];

      const githubMatch = line.match(/github\.com\/[\w-]+/i);
      if (githubMatch) resume.github = githubMatch[0];

      headerEndIndex = i + 1;
    }

    // Second pass - extract sections
    for (let i = headerEndIndex; i < lines.length; i++) {
      const line = lines[i];

      // Check if this is a section header
      let foundSectionType = null;
      for (const [type, pattern] of Object.entries(sectionPatterns)) {
        if (pattern.test(line)) {
          // Save previous section
          if (currentSection) {
            if (currentItem) {
              currentSection.items.push(currentItem);
            }
            resume.sections.push(currentSection);
          }

          currentSection = { title: line, type, items: [] };
          currentItem = null;
          foundSectionType = type;
          break;
        }
      }

      if (foundSectionType) continue;

      // If we're in a section, parse the content
      if (currentSection) {
        if (currentSection.type === 'skills') {
          // Skills - each line is a skill or skill group
          if (line.startsWith('•') || line.startsWith('-')) {
            currentSection.items.push(line.substring(1).trim());
          } else if (line.includes(':')) {
            // Skill group like "Languages: Python, JavaScript"
            currentSection.items.push(line);
          }
        } else if (currentSection.type === 'experience' || currentSection.type === 'projects') {
          // Check for title/company line (usually has date at end or company indicator)
          const dateMatch = line.match(/\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}\s*[–\-]\s*(?:Present|Current|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4})|\d{4}\s*[–\-]\s*(?:Present|\d{4})|(?:Present|Current))\b/i);

          if (dateMatch && currentItem) {
            // This is a date line, might be part of current item or new item
            if (!currentItem.dates) {
              currentItem.dates = dateMatch[1];
            }
          } else if (line.startsWith('•') || line.startsWith('-') || line.startsWith('·')) {
            // Bullet point
            if (!currentItem) currentItem = { bullets: [] };
            if (!currentItem.bullets) currentItem.bullets = [];
            currentItem.bullets.push(line.replace(/^[•\-·]\s*/, ''));
          } else if (line.toLowerCase().includes('tech stack') || line.toLowerCase().includes('technologies')) {
            // Tech stack line
            if (currentItem) {
              currentItem.techStack = line.replace(/tech\s*stack\s*:?\s*/i, '').replace(/technologies\s*:?\s*/i, '');
            }
          } else if (line.includes('|') && !currentItem?.title) {
            // Title with link separator like "Company | Link"
            currentItem = { title: line, bullets: [] };
          } else if (line.length > 0 && !currentItem) {
            // Start of new entry
            currentItem = { title: line, bullets: [] };
          } else if (line.length > 0 && currentItem?.bullets?.length > 0) {
            currentSection.items.push(currentItem);
            currentItem = { title: line, bullets: [] };
          } else if (line.length > 0 && currentItem && !currentItem.bullets?.length && !currentItem.description) {
            // Description line
            currentItem.description = line;
          }
        } else if (currentSection.type === 'education') {
          // Education - simpler parsing
          if (line.includes('|') || line.includes('–') || line.includes('-')) {
            currentSection.items.push({
              institution: line.split(/[|–-]/)[0]?.trim(),
              dates: line.match(/\d{4}|\d{4}\s*[–\-]\s*\d{4}|Present/i)?.[0]
            });
          } else if (line.length > 0) {
            currentSection.items.push({ institution: line });
          }
        } else {
          // Default - just add as text
          if (line.length > 0) {
            currentSection.items.push(line);
          }
        }
      }
    }

    // Add last section
    if (currentSection) {
      if (currentItem) {
        currentSection.items.push(currentItem);
      }
      resume.sections.push(currentSection);
    }

    return resume;
  }

  /**
   * Generate a DOCX from resume text with proper formatting
   */
  async generateDOCX(resumeText, originalFileName = 'resume') {
    const resume = this.parseResumeStructure(resumeText);

    const children = [];

    // Name - large, centered
    if (resume.name) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: resume.name, bold: true, size: 36 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
        })
      );
    }

    // Contact info - small, centered, gray
    const contactParts = [resume.email, resume.phone, resume.linkedin, resume.github].filter(Boolean);
    if (contactParts.length > 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: contactParts.join(' | '), size: 18, color: '666666' })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        })
      );
    }

    // Process sections
    for (const section of resume.sections) {
      // Section header
      children.push(
        new Paragraph({
          children: [new TextRun({ text: section.title.toUpperCase(), bold: true, size: 24, color: '2563eb' })],
          spacing: { before: 200, after: 100 },
          border: {
            bottom: { color: '2563eb', space: 1, style: BorderStyle.SINGLE, size: 6 },
          },
        })
      );

      // Section content based on type
      if (section.type === 'skills') {
        for (const skill of section.items) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: '• ' + skill, size: 20 })],
              spacing: { after: 50 },
            })
          );
        }
      } else if (section.type === 'experience' || section.type === 'projects') {
        for (const item of section.items) {
          // Title
          if (item.title) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({ text: item.title, bold: true, size: 22 }),
                  item.dates ? new TextRun({ text: '  ' + item.dates, size: 18, italics: true }) : new TextRun(''),
                ],
                spacing: { before: 100 },
              })
            );
          }

          // Bullets
          if (item.bullets) {
            for (const bullet of item.bullets) {
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: '• ' + bullet, size: 20 })],
                  spacing: { after: 30 },
                })
              );
            }
          }

          // Tech stack
          if (item.techStack) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: 'Tech Stack: ', italics: true, size: 18 }),
                           new TextRun({ text: item.techStack, size: 18 })],
                spacing: { after: 50 },
              })
            );
          }
        }
      } else if (section.type === 'education') {
        for (const item of section.items) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: item.institution || '', bold: true, size: 22 }),
                new TextRun({ text: '  ' + (item.dates || ''), size: 18 }),
              ],
              spacing: { after: 50 },
            })
          );
          if (item.degree) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: item.degree, italics: true, size: 20 })],
                spacing: { after: 100 },
              })
            );
          }
        }
      } else {
        // Default - just text
        for (const item of section.items) {
          if (typeof item === 'string') {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: '• ' + item, size: 20 })],
                spacing: { after: 50 },
              })
            );
          }
        }
      }
    }

    const doc = new Document({
      sections: [{ properties: {}, children }],
    });

    return Packer.toBuffer(doc);
  }

  /**
   * Detect original file format
   */
  detectFormat(mimeType, fileName) {
    if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
      return 'pdf';
    }
    if (mimeType?.includes('word') || fileName.toLowerCase().endsWith('.docx') || fileName.toLowerCase().endsWith('.doc')) {
      return 'docx';
    }
    return 'pdf'; // Default to PDF
  }

  /**
   * Generate document in the same format as original
   */
  async generateDocument(resumeText, originalMimeType, originalFileName) {
    const format = this.detectFormat(originalMimeType, originalFileName);
    const baseName = originalFileName.replace(/\.[^/.]+$/, '');
    const newFileName = `${baseName}_improved.${format}`;

    let buffer;
    if (format === 'docx') {
      buffer = await this.generateDOCX(resumeText, baseName);
    } else {
      buffer = await this.generatePDF(resumeText, baseName);
    }

    return {
      buffer,
      fileName: newFileName,
      mimeType: format === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/pdf',
    };
  }
}

export const documentGeneratorService = new DocumentGeneratorService();
