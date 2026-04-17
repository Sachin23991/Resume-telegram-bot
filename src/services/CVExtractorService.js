import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';
import mammoth from 'mammoth';

export class CVExtractorService {
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

  async extractText(buffer, mimeType) {
    if (mimeType === 'application/pdf') {
      return this.extractFromPDF(buffer);
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword' ||
      mimeType === 'docx' ||
      mimeType === 'doc'
    ) {
      return this.extractFromWord(buffer);
    } else if (mimeType.startsWith('image/')) {
      return this.extractFromImage(buffer);
    } else {
      throw new Error('Unsupported file type. Please send a PDF, Word document, or image.');
    }
  }
}

export const cvExtractorService = new CVExtractorService();
