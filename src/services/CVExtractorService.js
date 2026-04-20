import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';
import mammoth from 'mammoth';

export class CVExtractorService {
  resolveMimeType(mimeType, fileName = '') {
    const normalizedMimeType = String(mimeType || '').toLowerCase();
    const normalizedFileName = String(fileName || '').toLowerCase();

    if (normalizedMimeType && normalizedMimeType !== 'application/octet-stream') {
      if (normalizedMimeType === 'image/jpg') {
        return 'image/jpeg';
      }
      return normalizedMimeType;
    }

    if (normalizedFileName.endsWith('.pdf')) {
      return 'application/pdf';
    }

    if (normalizedFileName.endsWith('.docx')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    if (normalizedFileName.endsWith('.doc')) {
      return 'application/msword';
    }

    if (normalizedFileName.endsWith('.png')) {
      return 'image/png';
    }

    if (normalizedFileName.endsWith('.jpg') || normalizedFileName.endsWith('.jpeg')) {
      return 'image/jpeg';
    }

    return normalizedMimeType || 'application/octet-stream';
  }

  async extractFromPDF(buffer) {
    try {
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      console.error('PDF extraction error:', error);
      throw new Error('Failed to extract text from PDF');
    }
  }

  async extractFromWord(buffer) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      console.error('Word extraction error:', error);
      throw new Error('Failed to extract text from Word document');
    }
  }

  async extractFromImage(buffer) {
    try {
      const result = await Tesseract.recognize(buffer, 'eng', {
        logger: (m) => console.log('OCR progress:', m.progress),
      });
      return result.data.text;
    } catch (error) {
      console.error('OCR extraction error:', error);
      throw new Error('Failed to extract text from image');
    }
  }

  async extractText(buffer, mimeType, fileName = '') {
    const resolvedMimeType = this.resolveMimeType(mimeType, fileName);

    if (resolvedMimeType === 'application/pdf') {
      return this.extractFromPDF(buffer);
    } else if (
      resolvedMimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      resolvedMimeType === 'application/msword'
    ) {
      return this.extractFromWord(buffer);
    } else if (resolvedMimeType.startsWith('image/')) {
      return this.extractFromImage(buffer);
    } else {
      throw new Error('Unsupported file type. Please send a PDF, Word document, or image.');
    }
  }
}

export const cvExtractorService = new CVExtractorService();
