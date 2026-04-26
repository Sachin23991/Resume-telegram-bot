<div align="center">

# 🤖 CV Analyzer Pro

### *AI-Powered Resume Analysis & Enhancement Telegram Bot*

[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Telegraf](https://img.shields.io/badge/Telegraf-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://telegraf.js.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://mongodb.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

<p align="center">
  <img src="https://readme-typing-svg.herokuapp.com?font=Fira+Code&weight=600&size=22&pause=1000&color=36BCF7FF&center=true&vCenter=true&width=600&lines=Analyze+Resumes+with+AI;Multi-Provider+API+Fallback;Generate+Cover+Letters;Score+Match+Percentage;Improve+Your+CV+Automatically" alt="Typing SVG" />
</p>

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Quick Start](#-quick-start)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Deployment](#-deployment)
- [Usage](#-usage)
- [Documentation](#-documentation)
- [Project Structure](#-project-structure)
- [API Providers](#-api-providers)
- [Troubleshooting](#-troubleshooting)

---

## 🎯 Overview

**CV Analyzer Pro** is an intelligent Telegram bot that helps job seekers analyze, score, and improve their resumes against specific job descriptions. Built with a robust multi-provider AI architecture, it ensures high availability through intelligent API failover systems.

### Key Capabilities

```
┌─────────────────────────────────────────────────────────────────┐
│  🚀 Multi-Provider AI Architecture                              │
│     └── OpenRouter (Gemini 2.5 Flash) → Gemini                  │
│                                                                 │
│  🔁 Intelligent API Key Rotation                               │
│     └── 4+ keys per provider with automatic failover           │
│                                                                 │
│  📊 Smart Resume Parsing                                       │
│     └── APILayer → CVParser → UseResume → AI Fallback          │
│                                                                 │
│  🎯 Comprehensive Analysis                                     │
│     └── Match Score • Keywords • Suggestions • Improvements    │
│                                                                 │
│  📝 Document Generation                                        │
│     └── Improved CV • Cover Letter • PDF/DOCX Output           │
└─────────────────────────────────────────────────────────────────┘
```

### What Makes It Special

1. **Triple-Layer Fallback System**: If one AI provider fails, automatically tries the next
2. **Circuit Breaker Pattern**: Intelligently disables failing API keys, recovers automatically
3. **Multi-Format Support**: PDF, DOCX, PNG, JPG with OCR for images
4. **Professional Output**: ATS-compatible resume formatting
5. **Session Persistence**: MongoDB-backed workflow tracking

---

## ✨ Features

### Core Features

| Feature | Description | Status |
|---------|-------------|--------|
| 📄 **CV Analysis** | Extract and analyze resume content from PDF, DOCX, or images | ✅ |
| 🎯 **Match Scoring** | AI-powered 0-100 score against job descriptions | ✅ |
| 🔍 **Keyword Detection** | Identify missing keywords from job requirements | ✅ |
| 💡 **Smart Suggestions** | AI-generated improvement recommendations | ✅ |
| ✨ **Resume Rewrite** | Generate improved CV with better formatting | ✅ |
| 📝 **Cover Letters** | Create tailored cover letters for each job | ✅ |
| 🔄 **Multi-Format Support** | PDF, DOCX, PNG, JPG input/output | ✅ |
| 💾 **Session History** | MongoDB workflow tracking | ✅ |

### Supported File Formats

```
Input Formats:                      Output Formats:
├── 📄 PDF (.pdf)                   ├── 📄 PDF (.pdf)
├── 📝 Word (.docx, .doc)           └── 📝 Word (.docx)
├── 🖼️ Images (.png, .jpg)
└── 💬 Text (pasted directly)
```

---

## 🚀 Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/Sachin23991/Resume-telegram-bot.git
cd Resume-telegram-bot

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env

# 4. Configure your API keys (see Configuration section)
nano .env

# 5. Start the bot
npm start
```

---

## 📦 Installation

### Prerequisites

- Node.js 18+ 
- MongoDB Atlas account (or local MongoDB)
- Telegram Bot Token (from @BotFather)
- API keys for AI providers (see [Configuration](#-configuration))

### Step-by-Step Setup

```bash
# 1. Install Node.js dependencies
npm install

# 2. Set up environment variables
# Copy .env.example to .env and fill in your values
cp .env.example .env

# 3. Start in development mode (long polling)
npm start

# Or use watch mode for development
npm run dev
```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file with the following:

```bash
# ═══════════════════════════════════════════════════════════
# CV Analyzer Bot - Environment Configuration
# ═══════════════════════════════════════════════════════════

# Telegram Bot (required)
# Get from @BotFather: https://t.me/botfather
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# MongoDB Database (required)
MONGODB_URL=mongodb+srv://user:password@cluster.mongodb.net/dbname
MONGODB_DB_NAME=cv-analyzer

# OpenRouter AI Keys (Primary Provider - 3 keys + fallback)
# Get from: https://openrouter.ai/
OPENROUTER_KEY_1=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx
OPENROUTER_KEY_2=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx
OPENROUTER_KEY_3=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx
OPENROUTER_KEY_FALLBACK=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx
OPENROUTER_MODEL=google/gemini-2.5-flash

# Google Gemini (Secondary Provider)
# Get from: https://ai.google.dev/
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxx

# APILayer Resume Parser (4 keys for rotation)
# Get from: https://apilayer.com/
APILAYER_KEY_1=xxxxxxxxxxxxxxxxxxxxxxxx
APILAYER_KEY_2=xxxxxxxxxxxxxxxxxxxxxxxx
APILAYER_KEY_3=xxxxxxxxxxxxxxxxxxxxxxxx
APILAYER_KEY_4=xxxxxxxxxxxxxxxxxxxxxxxx

# CVParser API (4 keys for rotation)
# Get from: https://cvparser-api.com/
CVPARSER_KEY_1=cvp_live_xxxxxxxxxxxxxxxxxxxxxxxx
CVPARSER_KEY_2=cvp_live_xxxxxxxxxxxxxxxxxxxxxxxx
CVPARSER_KEY_3=cvp_live_xxxxxxxxxxxxxxxxxxxxxxxx
CVPARSER_KEY_4=cvp_live_xxxxxxxxxxxxxxxxxxxxxxxx
CVPARSER_API_URL=https://api.cvparser-api.com/graphql

# UseResume API (3 keys for rotation)
# Get from: https://useresume.com/
USERESUME_KEY_1=ur_live_xxxxxxxxxxxxxxxxxxxxxxxx
USERESUME_KEY_2=ur_live_xxxxxxxxxxxxxxxxxxxxxxxx
USERESUME_KEY_3=ur_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

### API Key Setup

| Provider | URL | Purpose | Free Tier |
|----------|-----|---------|-----------|
| [OpenRouter](https://openrouter.ai/) | `openrouter.ai` | Primary AI (Gemini 2.5 Flash) | ✅ |
| [Google Gemini](https://ai.google.dev/) | `makersuite.google.com` | Secondary AI | ✅ |
| [APILayer](https://apilayer.com/) | `apilayer.com` | Resume parsing | ✅ 50/month |
| [CVParser](https://cvparser-api.com/) | `cvparser-api.com` | Resume parsing | ✅ Trial |
| [UseResume](https://useresume.com/) | `useresume.com` | Resume parsing | ✅ Trial |

---

## 🌐 Deployment

### Render Deployment (Web Service)

The project includes `render.yaml` for easy deployment:

1. Push to GitHub
2. In Render, click **New +** → **Web Service**
3. Select your repository
4. Render auto-detects `render.yaml`
5. Set environment variables in Render dashboard
6. Deploy!

**Notes:**
- Uses webhook mode in production
- Free instances may sleep (not suitable for 24/7 bot)

### AWS ECS Fargate (24/7)

For always-on deployment, follow the detailed guide:

📄 **[AWS Deployment Guide →](docs/AWS_DEPLOYMENT.md)**

```bash
# Quick summary:
# 1. Build Docker image
# 2. Push to ECR
# 3. Create ECS task definition
# 4. Deploy as Fargate service
```

---

## 📱 Usage

### Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Begin new CV analysis session |
| `/help` | Show help and supported formats |
| `/menu` | Show main menu with options |
| `/cancel` | Cancel current session |
| `/history` | View past analyses |
| `/stats` | Your usage statistics |
| `/info` | Bot information and version |

### User Flow

```
1. Send /start
   └─► Bot welcomes you and requests CV

2. Upload CV (PDF/DOCX/Image)
   └─► Bot extracts and parses

3. Send Job Description
   └─► Paste text or upload file

4. View Analysis
   └─► Score + Strengths + Weaknesses + Suggestions

5. Choose Action
   ├─► [Improve CV] → Get rewritten resume
   ├─► [Cover Letter] → Get tailored cover letter
   ├─► [Both] → Get both documents
   ├─► [Report] → View detailed analysis
   └─► [Done] → End session
```

### Example Conversation

```
👤 User: /start

🤖 Bot:
┌─────────────────────────────────────┐
│ 👋 Welcome to CV Analyzer Bot!      │
│                                     │
│ I help you analyze, score, and      │
│ improve your resume.                │
│                                     │
│ To get started, send me your CV!    │
└─────────────────────────────────────┘

👤 User: [Uploads resume.pdf]

🤖 Bot:
✅ CV Received!

Now send me the job description.
You can send:
• Paste text directly
• Send a PDF file
• Send a Word document (.docx)

👤 User: [Pastes job description]

🤖 Bot:
⏳ Analyzing your CV...

[30 seconds later]

📊 Analysis Results

Match Score: 72/100 (🤖 AI Analysis)
📊 Decent match. Some improvements could help.

✅ Strengths:
• Strong technical background
• Relevant certifications

❌ Missing Keywords:
React Native, Docker, CI/CD, Agile

💡 Key Improvements:
1. [Experience] Add quantified achievements
2. [Skills] Include Docker and Kubernetes

What would you like to do?
[Improve CV] [Cover Letter] [Both] [Done]
```

---

## 📚 Documentation

For detailed technical information, see the documentation files:

| Document | Description |
|----------|-------------|
| **[Architecture](docs/ARCHITECTURE.md)** | System architecture, design patterns, component diagrams |
| **[Workflow](docs/WORKFLOW.md)** | Complete user journey, state machine, command reference |
| **[Scoring Mechanism](docs/SCORING_MECHANISM.md)** | How scores are calculated, ATS weights, AI prompts |
| **[API Fallback](docs/API_FALLBACK.md)** | Fallback chains, circuit breaker, retry strategy |
| **[AWS Deployment](docs/AWS_DEPLOYMENT.md)** | Step-by-step AWS ECS deployment guide |

---

## 📁 Project Structure

```
Resume-telegram-bot/
│
├── 📂 src/
│   ├── 📄 app.js                    # Entry point - Bot initialization
│   │
│   ├── 📂 config/
│   │   └── 📄 index.js              # Environment config & API keys
│   │
│   ├── 📂 controllers/
│   │   └── 📄 CVController.js       # Main business logic orchestrator
│   │
│   ├── 📂 models/
│   │   ├── 📄 index.js              # Model exports
│   │   └── 📄 UserSession.js        # Session state management
│   │
│   ├── 📂 services/                 # Core business services
│   │   ├── 📄 AIService.js          # AI provider abstraction
│   │   ├── 📄 APIKeyRotationService.js  # Key rotation & circuit breaker
│   │   ├── 📄 APILayerService.js    # APILayer integration
│   │   ├── 📄 CVExtractorService.js # PDF/DOCX/OCR extraction
│   │   ├── 📄 CVParserService.js    # CVParser integration
│   │   ├── 📄 UseResumeService.js   # UseResume integration
│   │   ├── 📄 DocumentGeneratorService.js  # PDF/DOCX generation
│   │   ├── 📄 ResumeRendererService.js   # Resume templating
│   │   ├── 📄 ResumeTemplateService.js   # Resume data structures
│   │   └── 📄 WorkflowStoreService.js    # MongoDB persistence
│   │
│   ├── 📂 utils/
│   │   └── 📄 index.js              # Utility functions
│   │
│   ├── 📂 views/
│   │   ├── 📄 index.js              # View exports
│   │   └── 📄 TelegramView.js       # UI/Messages for Telegram
│   │
│   └── 📂 prompts/
│       └── 📄 resume-score-system-prompt.md  # AI scoring prompt
│
├── 📂 docs/                       # Documentation
│   ├── 📄 ARCHITECTURE.md         # System architecture
│   ├── 📄 WORKFLOW.md             # User workflow
│   ├── 📄 SCORING_MECHANISM.md    # Scoring details
│   ├── 📄 API_FALLBACK.md         # Fallback system
│   └── 📄 AWS_DEPLOYMENT.md       # AWS deployment
│
├── 📄 .env.example                # Environment template
├── 📄 Dockerfile                  # Container configuration
├── 📄 package.json                # Dependencies & scripts
├── 📄 render.yaml                 # Render deployment config
└── 📄 README.md                   # This file
```

---

## 🔌 API Providers

### AI Provider Chain

```
Primary: OpenRouter (Gemini 2.5 Flash)
   │
   ├─ KEY_1 → KEY_2 → KEY_3 → FALLBACK_KEY
   │
   ▼ (on failure)
Secondary: Google Gemini (gemini-2.5-flash)
   │
   ▼ (on failure)
Tertiary: Default Score (50/100)
```

### Parser Chain

```
1️⃣ APILayer (Primary)
   │
   ▼ (on failure)
2️⃣ CVParser (Secondary)
   │
   ▼ (on failure)
3️⃣ UseResume (Tertiary)
   │
   ▼ (on failure)
4️⃣ AI Extraction (OpenRouter/Gemini)
   │
   ▼ (on failure)
5️⃣ Raw Text Only (Final fallback)
```

### Key Rotation

Each provider uses **round-robin key rotation** with **circuit breaker** pattern:

- **Circuit opens** after 5 consecutive failures
- **Recovery timeout**: 60 seconds
- **Half-open testing**: 2 consecutive successes to close

---

## 🛠️ Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| "All AI providers failed" | Check API keys in .env, verify credits |
| "Session expired" | User took too long (>1 hour), send /start again |
| PDF not parsing | Try image format or check if scanned PDF |
| MongoDB connection error | Check MONGODB_URL format and network access |
| Bot not responding | Check TELEGRAM_BOT_TOKEN, verify webhook/polling mode |

### Debug Mode

```bash
# Enable verbose logging
DEBUG=cv-analyzer:* npm start

# Or check logs directly
tail -f logs/bot.log
```

### Bot Logs

```
✅ HTTP server listening on port 3000
📡 Bot is running with long polling...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ CV Analyzer Pro is running!
🎯 Listening for messages...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🔒 Security

- **API Keys**: Stored in environment variables, never committed
- **Data Handling**: CV data processed in-memory, no persistent storage
- **Session Expiry**: Auto-cleanup after 1 hour
- **Input Validation**: File type whitelist, size limits

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m "Add amazing feature"`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📜 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Telegraf](https://telegraf.js.org/) - Modern Telegram Bot Framework
- [PDFKit](https://pdfkit.org/) - PDF generation library
- [Mammoth](https://github.com/mwilliamson/mammoth.js) - Word document parsing
- [Tesseract.js](https://github.com/naptha/tesseract.js) - OCR for images
- [OpenRouter](https://openrouter.ai/) - Unified AI API
- [Gemini](https://ai.google.dev/) - Google's AI platform

---

<div align="center">
### Made By Sachin Rao
### Made with ❤️ for Job Seekers Worldwide

**[⬆ Back to Top](#-cv-analyzer-pro)**

</div>
