# AI.md: MedMinder AI Context & Strategy

## Mission
Bridging the health equity gap for elderly immigrants (Korean, Spanish, English speakers) through AI-driven medication adherence tracking and safety monitoring.

## Core Features (MVP)
1. **Smart Scan**: Parsing prescription labels into structured JSON (Drug name, Sig, Dose).
2. **FDA Validation**: Cross-checking with openFDA API for accuracy and DDI (Drug-Drug Interaction).
3. **Actionable Alerts**: Automated scheduling and PWA-based notifications.
4. **Adherence Logging**: One-tap tracking and visual progress reporting for physicians.

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Backend/DB**: Supabase (Auth, PostgreSQL, Storage)
- **Styling**: Tailwind CSS
- **AI Engine**: OpenAI Vision API (GPT-4o) & Vercel AI SDK
- **Deployment**: Vercel (PWA Optimized)

## UI/UX Guidelines (High-Accessibility & Mobile)
- **Visuals**: Giant buttons (min 48x48px), High-contrast (WCAG 2.1 AA), Clear icons.
- **Language & Localization**:
    - Avoid medical jargon (e.g., "Adherence" -> "Taking pills on time").
    - **Tri-lingual Support**: English, Korean, and Spanish.
    - Respectful, conversational tone for elderly users.
- **Mobile-First**: Thumb-friendly layout (actions in bottom 1/3), PWA offline support, and Haptic feedback.

## Safety & Compliance
- **Anti-Hallucination**: If AI confidence is low (<0.9), force manual user verification.
- **Privacy**: HIPAA-aware design. Minimize PHI storage; prioritize local processing.

## Development Workflow
1. **Interview**: PM (AI) proposes options -> User (Senior Eng) decides.
2. **Implementation**: Cursor codes based on selected option.
3. **Review**: PM summarizes and User confirms.