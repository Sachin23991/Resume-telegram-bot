import PDFDocument from 'pdfkit';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
} from 'docx';
import { Buffer } from 'buffer';
import { resumeTemplateService } from './ResumeTemplateService.js';

export class ResumeRendererService {
  normalizeResumeInput(resumeInput, fallbackText = '') {
    return resumeTemplateService.buildResumeData(resumeInput, fallbackText);
  }

  detectFormat(mimeType, fileName) {
    if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
      return 'pdf';
    }
    if (
      mimeType?.includes('word') ||
      fileName.toLowerCase().endsWith('.docx') ||
      fileName.toLowerCase().endsWith('.doc')
    ) {
      return 'docx';
    }
    return 'pdf';
  }

  getContactParts(profile) {
    return resumeTemplateService.uniqueStrings([
      profile.email,
      profile.phone,
      profile.location,
      ...(profile.links || []),
      profile.url,
    ]);
  }

  getSections(resume) {
    const sections = [];

    if (resume.workExperiences.length > 0) {
      sections.push({ key: 'workExperiences', title: 'WORK EXPERIENCE' });
    }
    if (resume.educations.length > 0) {
      sections.push({ key: 'educations', title: 'EDUCATION' });
    }
    if (resume.projects.length > 0) {
      sections.push({ key: 'projects', title: 'PROJECTS' });
    }
    if (
      resume.skills.featuredSkills.length > 0 ||
      resume.skills.descriptions.length > 0
    ) {
      sections.push({ key: 'skills', title: 'SKILLS' });
    }
    if (resume.custom.descriptions.length > 0) {
      sections.push({ key: 'custom', title: 'ADDITIONAL INFORMATION' });
    }

    return sections;
  }

  ensurePageSpace(doc, minimumSpace = 60) {
    const usableBottom = doc.page.height - doc.page.margins.bottom;
    if (doc.y + minimumSpace > usableBottom) {
      doc.addPage();
    }
  }

  drawSectionHeading(doc, title) {
    this.ensurePageSpace(doc, 36);
    doc.fillColor('#0f172a');
    doc.font('Helvetica-Bold').fontSize(11).text(title);
    const underlineY = doc.y + 1;
    doc
      .moveTo(doc.page.margins.left, underlineY)
      .lineTo(doc.page.width - doc.page.margins.right, underlineY)
      .lineWidth(1)
      .strokeColor('#38bdf8')
      .stroke();
    doc.moveDown(0.35);
  }

  drawBullet(doc, text, indent = 14) {
    doc.font('Helvetica').fontSize(10).fillColor('#111827');
    doc.text(`• ${text}`, doc.page.margins.left + indent, doc.y, {
      width:
        doc.page.width -
        doc.page.margins.left -
        doc.page.margins.right -
        indent,
      lineGap: 2,
    });
  }

  drawHeader(doc, resume) {
    const { profile } = resume;
    const contact = this.getContactParts(profile);

    doc.rect(0, 0, doc.page.width, 14).fill('#38bdf8');
    doc.moveDown(0.8);

    doc
      .fillColor('#0f172a')
      .font('Helvetica-Bold')
      .fontSize(21)
      .text(profile.name || 'Candidate Name', { align: 'center' });

    if (profile.summary) {
      doc.moveDown(0.55);
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#111827')
        .text(profile.summary, { lineGap: 3 });
    }

    if (contact.length > 0) {
      doc.moveDown(0.35);
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor('#475569')
        .text(contact.join(' | '), { align: 'center' });
    }

    doc.moveDown(0.4);
  }

  renderSectionPDF(doc, section, resume) {
    this.drawSectionHeading(doc, section.title);

    if (section.key === 'workExperiences') {
      resume.workExperiences.forEach((item, index) => {
        this.ensurePageSpace(doc, 52);
        const topY = doc.y;
        const titleWidth =
          doc.page.width - doc.page.margins.left - doc.page.margins.right - 110;
        const previousItem = index > 0 ? resume.workExperiences[index - 1] : null;
        const showCompany = !previousItem || previousItem.company !== item.company;
        const heading = showCompany
          ? [item.jobTitle, item.company].filter(Boolean).join(' | ')
          : item.jobTitle;

        doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#0f172a').text(
          heading,
          doc.page.margins.left,
          topY,
          { width: titleWidth }
        );

        if (item.date) {
          doc.font('Helvetica').fontSize(9.5).fillColor('#475569').text(
            item.date,
            doc.page.width - doc.page.margins.right - 110,
            topY,
            { width: 110, align: 'right' }
          );
        }

        doc.y = Math.max(doc.y, topY + 14);

        for (const bullet of item.descriptions) {
          this.drawBullet(doc, bullet);
        }

        doc.moveDown(0.45);
      });
      return;
    }

    if (section.key === 'educations') {
      resume.educations.forEach((item, index) => {
        this.ensurePageSpace(doc, 42);
        const topY = doc.y;
        const titleWidth =
          doc.page.width - doc.page.margins.left - doc.page.margins.right - 110;
        const previousItem = index > 0 ? resume.educations[index - 1] : null;
        const showSchool = !previousItem || previousItem.school !== item.school;
        const heading = showSchool
          ? [item.school, item.degree].filter(Boolean).join(' | ')
          : item.degree;

        doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#0f172a').text(
          heading,
          doc.page.margins.left,
          topY,
          { width: titleWidth }
        );

        if (item.date) {
          doc.font('Helvetica').fontSize(9.5).fillColor('#475569').text(
            item.date,
            doc.page.width - doc.page.margins.right - 110,
            topY,
            { width: 110, align: 'right' }
          );
        }

        doc.y = Math.max(doc.y, topY + 14);

        if (item.gpa) {
          doc.font('Helvetica-Oblique').fontSize(9.5).fillColor('#334155').text(`GPA: ${item.gpa}`);
        }

        for (const bullet of item.descriptions) {
          this.drawBullet(doc, bullet);
        }

        doc.moveDown(0.4);
      });
      return;
    }

    if (section.key === 'projects') {
      resume.projects.forEach((item, index) => {
        this.ensurePageSpace(doc, 42);
        const topY = doc.y;
        const titleWidth =
          doc.page.width - doc.page.margins.left - doc.page.margins.right - 110;
        const previousItem = index > 0 ? resume.projects[index - 1] : null;
        const showProjectName = !previousItem || previousItem.project !== item.project;

        doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#0f172a').text(
          showProjectName ? item.project : '',
          doc.page.margins.left,
          topY,
          { width: titleWidth }
        );

        if (item.date) {
          doc.font('Helvetica').fontSize(9.5).fillColor('#475569').text(
            item.date,
            doc.page.width - doc.page.margins.right - 110,
            topY,
            { width: 110, align: 'right' }
          );
        }

        doc.y = Math.max(doc.y, topY + 14);

        for (const bullet of item.descriptions) {
          this.drawBullet(doc, bullet);
        }

        doc.moveDown(0.4);
      });
      return;
    }

    if (section.key === 'skills') {
      const featured = resume.skills.featuredSkills
        .map((item) => item.skill)
        .filter(Boolean);

      if (featured.length > 0) {
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Featured Skills');
        doc.font('Helvetica').fontSize(10).text(featured.join(', '));
        doc.moveDown(0.25);
      }

      for (const line of resume.skills.descriptions) {
        this.drawBullet(doc, line);
      }

      doc.moveDown(0.35);
      return;
    }

    if (section.key === 'custom') {
      for (const line of resume.custom.descriptions) {
        this.drawBullet(doc, line);
      }
      doc.moveDown(0.35);
    }
  }

  async generateResumePDF(resumeInput, originalFileName = 'resume', fallbackText = '') {
    const resume = this.normalizeResumeInput(resumeInput, fallbackText);

    return new Promise((resolve, reject) => {
      try {
        const chunks = [];
        const doc = new PDFDocument({
          margin: 42,
          size: 'LETTER',
          info: {
            Title: originalFileName.replace(/\.[^/.]+$/, ''),
          },
        });

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        this.drawHeader(doc, resume);
        for (const section of this.getSections(resume)) {
          this.renderSectionPDF(doc, section, resume);
        }

        doc.end();
      } catch (error) {
        console.error('[ResumeRenderer] PDF generation error:', error);
        reject(error);
      }
    });
  }

  renderSectionDOCX(children, section, resume) {
    const addBullets = (lines) => {
      for (const line of lines) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: line, size: 20 })],
            bullet: { level: 0 },
            spacing: { after: 20 },
          })
        );
      }
    };

    children.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 160, after: 80 },
        border: {
          bottom: {
            style: BorderStyle.SINGLE,
            color: '38BDF8',
            size: 6,
            space: 1,
          },
        },
      })
    );

    if (section.key === 'workExperiences') {
      for (const item of resume.workExperiences) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: [item.jobTitle, item.company].filter(Boolean).join(' | '),
                bold: true,
                size: 22,
                color: '0F172A',
              }),
              item.date
                ? new TextRun({
                    text: `  ${item.date}`,
                    italics: true,
                    size: 18,
                    color: '475569',
                  })
                : new TextRun(''),
            ],
            spacing: { after: 40 },
          })
        );
        addBullets(item.descriptions);
      }
      return;
    }

    if (section.key === 'educations') {
      for (const item of resume.educations) {
        const meta = [item.date, item.gpa ? `GPA: ${item.gpa}` : '']
          .filter(Boolean)
          .join(' | ');

        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: [item.school, item.degree].filter(Boolean).join(' | '),
                bold: true,
                size: 22,
                color: '0F172A',
              }),
              meta
                ? new TextRun({
                    text: `  ${meta}`,
                    italics: true,
                    size: 18,
                    color: '475569',
                  })
                : new TextRun(''),
            ],
            spacing: { after: 40 },
          })
        );
        addBullets(item.descriptions);
      }
      return;
    }

    if (section.key === 'projects') {
      for (const item of resume.projects) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: item.project,
                bold: true,
                size: 22,
                color: '0F172A',
              }),
              item.date
                ? new TextRun({
                    text: `  ${item.date}`,
                    italics: true,
                    size: 18,
                    color: '475569',
                  })
                : new TextRun(''),
            ],
            spacing: { after: 40 },
          })
        );
        addBullets(item.descriptions);
      }
      return;
    }

    if (section.key === 'skills') {
      const featured = resume.skills.featuredSkills.map((item) => item.skill).filter(Boolean);
      if (featured.length > 0) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: 'Featured Skills: ', bold: true, size: 20 }),
              new TextRun({ text: featured.join(', '), size: 20 }),
            ],
            spacing: { after: 50 },
          })
        );
      }
      addBullets(resume.skills.descriptions);
      return;
    }

    if (section.key === 'custom') {
      addBullets(resume.custom.descriptions);
    }
  }

  async generateResumeDOCX(resumeInput, originalFileName = 'resume', fallbackText = '') {
    const resume = this.normalizeResumeInput(resumeInput, fallbackText);
    const children = [];
    const contact = this.getContactParts(resume.profile);

    if (resume.profile.name) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: resume.profile.name,
              bold: true,
              size: 34,
              color: '0F172A',
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
        })
      );
    }

    if (contact.length > 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: contact.join(' | '), size: 18, color: '475569' })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 160 },
        })
      );
    }

    if (resume.profile.summary) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: resume.profile.summary, size: 20, color: '111827' })],
          spacing: { after: 180 },
        })
      );
    }

    for (const section of this.getSections(resume)) {
      this.renderSectionDOCX(children, section, resume);
    }

    const doc = new Document({
      sections: [{ properties: {}, children }],
    });

    return Packer.toBuffer(doc);
  }

  async generateResumeDocument(
    resumeInput,
    originalMimeType,
    originalFileName,
    fallbackText = ''
  ) {
    const format = this.detectFormat(originalMimeType, originalFileName);
    const baseName = originalFileName.replace(/\.[^/.]+$/, '');
    const newFileName = `${baseName}_improved.${format}`;

    const buffer =
      format === 'docx'
        ? await this.generateResumeDOCX(resumeInput, baseName, fallbackText)
        : await this.generateResumePDF(resumeInput, baseName, fallbackText);

    return {
      buffer,
      fileName: newFileName,
      mimeType:
        format === 'docx'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/pdf',
    };
  }
}

export const resumeRendererService = new ResumeRendererService();
