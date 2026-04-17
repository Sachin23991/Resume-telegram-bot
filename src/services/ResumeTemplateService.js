export class ResumeTemplateService {
  normalizeString(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, ' ').trim();
  }

  normalizeArray(value) {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined || value === '') return [];
    return [value];
  }

  ensureStringArray(value) {
    return this.normalizeArray(value)
      .map((item) => this.normalizeString(item))
      .filter(Boolean);
  }

  firstNonEmpty(values = []) {
    for (const value of values) {
      const text = this.normalizeString(value);
      if (text) return text;
    }
    return '';
  }

  uniqueStrings(values = []) {
    const seen = new Set();
    const result = [];

    for (const value of values) {
      const text = this.normalizeString(value);
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      result.push(text);
    }

    return result;
  }

  createEmptyResume() {
    return {
      profile: {
        name: '',
        summary: '',
        email: '',
        phone: '',
        location: '',
        url: '',
        links: [],
      },
      workExperiences: [],
      educations: [],
      projects: [],
      skills: {
        featuredSkills: [],
        descriptions: [],
      },
      custom: {
        descriptions: [],
      },
    };
  }

  extractProfileFromText(fallbackText = '') {
    const lines = String(fallbackText || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const profile = {
      name: '',
      summary: '',
      email: '',
      phone: '',
      location: '',
      url: '',
      links: [],
    };

    if (lines.length === 0) {
      return profile;
    }

    for (const line of lines.slice(0, 8)) {
      if (!profile.email) {
        const emailMatch = line.match(/[\w.+-]+@[\w.-]+\.\w+/);
        if (emailMatch) profile.email = emailMatch[0];
      }

      if (!profile.phone) {
        const phoneMatch = line.match(/\+?\d[\d\s().-]{7,}\d/);
        if (phoneMatch) profile.phone = phoneMatch[0].trim();
      }

      const urls = line.match(/(?:https?:\/\/|www\.)\S+|(?:linkedin|github)\.com\/\S+/gi) || [];
      if (urls.length > 0) {
        profile.links = this.uniqueStrings([...profile.links, ...urls]);
      }

      if (!profile.location) {
        const locationMatch = line.match(/[A-Z][a-zA-Z.\s]+,\s*[A-Z]{2,}/);
        if (locationMatch) profile.location = locationMatch[0];
      }
    }

    const contactTokens = [profile.email, profile.phone, ...profile.links];
    profile.name =
      lines.find((line) => {
        if (line.length > 80) return false;
        if (contactTokens.some((token) => token && line.includes(token))) return false;
        if (/[0-9@]/.test(line)) return false;
        return true;
      }) || '';

    profile.url = profile.links[0] || '';

    const summaryStartIndex = lines.findIndex((line, index) => index > 0 && line.length > 60);
    if (summaryStartIndex >= 0) {
      profile.summary = lines.slice(summaryStartIndex, summaryStartIndex + 2).join(' ');
    }

    return profile;
  }

  normalizeLinks(...valueGroups) {
    const flattened = valueGroups.flatMap((value) => {
      if (Array.isArray(value)) return value;
      return [value];
    });

    return this.uniqueStrings(
      flattened.map((value) => {
        if (value && typeof value === 'object') {
          return value.url || value.link || value.href || value.value || '';
        }
        return value;
      })
    );
  }

  mapProfile(parsedData = {}, fallbackProfile = {}) {
    const root = parsedData && typeof parsedData === 'object' ? parsedData : {};
    const profile = root.profile && typeof root.profile === 'object' ? root.profile : {};

    const links = this.normalizeLinks(
      profile.links,
      profile.url,
      profile.linkedin,
      profile.github,
      root.links,
      root.url,
      root.website,
      root.linkedin,
      root.github,
      fallbackProfile.links
    );

    return {
      name: this.firstNonEmpty([profile.name, root.name, fallbackProfile.name]),
      email: this.firstNonEmpty([profile.email, root.email, fallbackProfile.email]),
      phone: this.firstNonEmpty([profile.phone, root.phone, fallbackProfile.phone]),
      location: this.firstNonEmpty([profile.location, root.location, fallbackProfile.location]),
      url: this.firstNonEmpty([profile.url, root.url, root.website, links[0], fallbackProfile.url]),
      links,
      summary: this.firstNonEmpty([
        profile.summary,
        root.summary,
        root.objective,
        fallbackProfile.summary,
      ]),
    };
  }

  mapWorkExperiences(parsedData = {}) {
    const root = parsedData && typeof parsedData === 'object' ? parsedData : {};
    const items = this.normalizeArray(
      root.workExperiences ||
        root.work_experiences ||
        root.experience ||
        root.employment ||
        root.employment_history
    );

    return items
      .map((item) => {
        const row = item && typeof item === 'object' ? item : { jobTitle: item };
        const descriptions = this.uniqueStrings([
          ...this.ensureStringArray(
            row.descriptions || row.highlights || row.responsibilities || row.bullets
          ),
          ...this.ensureStringArray(row.description),
        ]);

        return {
          company: this.firstNonEmpty([row.company, row.organization, row.employer]),
          jobTitle: this.firstNonEmpty([row.jobTitle, row.title, row.position, row.role]),
          date: this.firstNonEmpty([row.date, row.dates, row.duration, row.period]),
          descriptions,
        };
      })
      .filter(
        (item) =>
          item.company || item.jobTitle || item.date || item.descriptions.length > 0
      );
  }

  mapEducations(parsedData = {}) {
    const root = parsedData && typeof parsedData === 'object' ? parsedData : {};
    const items = this.normalizeArray(
      root.educations || root.education || root.academics || root.academic_background
    );

    return items
      .map((item) => {
        const row = item && typeof item === 'object' ? item : { degree: item };
        const descriptions = this.uniqueStrings([
          ...this.ensureStringArray(row.descriptions || row.highlights),
          ...this.ensureStringArray(row.description),
        ]);

        return {
          school: this.firstNonEmpty([
            row.school,
            row.institution,
            row.university,
            row.college,
          ]),
          degree: this.firstNonEmpty([row.degree, row.qualification, row.studyType]),
          gpa: this.firstNonEmpty([row.gpa, row.grade]),
          date: this.firstNonEmpty([row.date, row.dates, row.year, row.duration]),
          descriptions,
        };
      })
      .filter(
        (item) =>
          item.school || item.degree || item.date || item.gpa || item.descriptions.length > 0
      );
  }

  mapProjects(parsedData = {}) {
    const root = parsedData && typeof parsedData === 'object' ? parsedData : {};
    const items = this.normalizeArray(root.projects || root.project || root.portfolio);

    return items
      .map((item) => {
        const row = item && typeof item === 'object' ? item : { project: item };
        const descriptions = this.uniqueStrings([
          ...this.ensureStringArray(row.descriptions || row.highlights || row.bullets),
          ...this.ensureStringArray(row.description),
        ]);

        return {
          project: this.firstNonEmpty([row.project, row.name, row.title]),
          date: this.firstNonEmpty([row.date, row.dates, row.duration]),
          descriptions,
        };
      })
      .filter((item) => item.project || item.date || item.descriptions.length > 0);
  }

  mapSkills(parsedData = {}) {
    const root = parsedData && typeof parsedData === 'object' ? parsedData : {};
    const skillRoot =
      root.skills ||
      root.technicalSkills ||
      root.technical_skills ||
      root.technologies ||
      root.stack ||
      {};

    const featuredSkills = [];
    const descriptions = [];

    const addSkill = (value, rating = 0) => {
      const skill = this.normalizeString(value);
      if (!skill) return;
      if (featuredSkills.some((item) => item.skill.toLowerCase() === skill.toLowerCase())) return;
      if (featuredSkills.length < 6) {
        featuredSkills.push({ skill, rating: Number(rating) || 0 });
      } else {
        descriptions.push(skill);
      }
    };

    const addDescriptionLine = (value) => {
      const text = this.normalizeString(value);
      if (!text) return;
      if (!descriptions.some((item) => item.toLowerCase() === text.toLowerCase())) {
        descriptions.push(text);
      }
    };

    if (Array.isArray(skillRoot)) {
      skillRoot.forEach((skill) => addSkill(skill));
    } else if (skillRoot && typeof skillRoot === 'object') {
      this.normalizeArray(skillRoot.featuredSkills || skillRoot.featured || []).forEach((item) => {
        if (item && typeof item === 'object') {
          addSkill(item.skill || item.name || item.title, item.rating);
        } else {
          addSkill(item);
        }
      });

      this.normalizeArray(skillRoot.descriptions || skillRoot.list || skillRoot.items).forEach(
        (line) => addDescriptionLine(line)
      );

      for (const [key, value] of Object.entries(skillRoot)) {
        if (['featuredSkills', 'featured', 'descriptions', 'list', 'items'].includes(key)) {
          continue;
        }

        if (Array.isArray(value)) {
          const cleaned = this.ensureStringArray(value);
          if (cleaned.length > 0) {
            addDescriptionLine(`${key}: ${cleaned.join(', ')}`);
          }
        } else if (typeof value === 'string') {
          addDescriptionLine(`${key}: ${this.normalizeString(value)}`);
        }
      }
    }

    this.normalizeArray(root.skills_list || root.skill_list || root.keywords).forEach((skill) =>
      addSkill(skill)
    );

    return {
      featuredSkills,
      descriptions: this.uniqueStrings(descriptions),
    };
  }

  mapCustom(parsedData = {}) {
    const root = parsedData && typeof parsedData === 'object' ? parsedData : {};
    const custom = root.custom && typeof root.custom === 'object' ? root.custom : {};

    const descriptions = this.uniqueStrings([
      ...this.ensureStringArray(custom.descriptions),
      ...this.ensureStringArray(root.additional),
      ...this.ensureStringArray(root.achievements),
      ...this.ensureStringArray(root.certifications),
      ...this.ensureStringArray(root.languages),
      ...this.ensureStringArray(root.awards),
    ]);

    return { descriptions };
  }

  buildResumeData(parsedData = {}, fallbackText = '') {
    let safeParsedData = parsedData;
    let safeFallbackText = fallbackText;

    if (typeof safeParsedData === 'string') {
      safeFallbackText = safeParsedData;
      safeParsedData = {};
    }

    if (!safeParsedData || typeof safeParsedData !== 'object') {
      safeParsedData = {};
    }

    const fallbackProfile = this.extractProfileFromText(
      safeFallbackText ||
        safeParsedData.full_text ||
        safeParsedData.raw_text ||
        safeParsedData.text ||
        ''
    );

    const resume = this.createEmptyResume();
    resume.profile = this.mapProfile(safeParsedData, fallbackProfile);
    resume.workExperiences = this.mapWorkExperiences(safeParsedData);
    resume.educations = this.mapEducations(safeParsedData);
    resume.projects = this.mapProjects(safeParsedData);
    resume.skills = this.mapSkills(safeParsedData);
    resume.custom = this.mapCustom(safeParsedData);

    if (!resume.profile.summary && resume.custom.descriptions.length > 0) {
      const longLine = resume.custom.descriptions.find((line) => line.length > 80);
      if (longLine) {
        resume.profile.summary = longLine;
        resume.custom.descriptions = resume.custom.descriptions.filter((line) => line !== longLine);
      }
    }

    return resume;
  }

  buildTemplateText(parsedData = {}, fallbackText = '') {
    const resume = this.buildResumeData(parsedData, fallbackText);
    const { profile, workExperiences, educations, projects, skills, custom } = resume;
    const lines = [];

    lines.push(profile.name || 'Candidate Name');

    const contact = this.uniqueStrings([
      profile.email,
      profile.phone,
      profile.location,
      ...profile.links,
      profile.url,
    ]);

    if (contact.length > 0) {
      lines.push(contact.join(' | '));
    }

    lines.push('');

    if (profile.summary) {
      lines.push('SUMMARY');
      lines.push(profile.summary);
      lines.push('');
    }

    if (workExperiences.length > 0) {
      lines.push('WORK EXPERIENCE');
      for (const item of workExperiences) {
        lines.push([item.jobTitle, item.company].filter(Boolean).join(' | '));
        if (item.date) lines.push(item.date);
        item.descriptions.forEach((bullet) => lines.push(`- ${bullet}`));
        lines.push('');
      }
    }

    if (educations.length > 0) {
      lines.push('EDUCATION');
      for (const item of educations) {
        lines.push([item.school, item.degree].filter(Boolean).join(' | '));
        const meta = [item.date, item.gpa ? `GPA: ${item.gpa}` : ''].filter(Boolean).join(' | ');
        if (meta) lines.push(meta);
        item.descriptions.forEach((bullet) => lines.push(`- ${bullet}`));
        lines.push('');
      }
    }

    if (projects.length > 0) {
      lines.push('PROJECTS');
      for (const item of projects) {
        lines.push(item.project);
        if (item.date) lines.push(item.date);
        item.descriptions.forEach((bullet) => lines.push(`- ${bullet}`));
        lines.push('');
      }
    }

    lines.push('SKILLS');
    if (skills.featuredSkills.length > 0) {
      lines.push(skills.featuredSkills.map((skill) => skill.skill).join(', '));
    }
    skills.descriptions.forEach((line) => lines.push(line));
    lines.push('');

    if (custom.descriptions.length > 0) {
      lines.push('ADDITIONAL INFORMATION');
      custom.descriptions.forEach((line) => lines.push(`- ${line}`));
      lines.push('');
    }

    if (fallbackText && fallbackText.trim()) {
      lines.push('RAW EXTRACTED TEXT (REFERENCE)');
      lines.push(fallbackText.slice(0, 8000));
    }

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
}

export const resumeTemplateService = new ResumeTemplateService();
