# AI Competitor Signals

## Overview

AI Competitor Signals is a competitive intelligence application that helps businesses track and analyze their competitors using AI-powered insights. The app aggregates publicly available signals from news, funding announcements, and social media to generate professional competitive intelligence reports. It features a tiered access system with free and logged-in user levels, rate limiting for fair usage, and AI-generated summaries for actionable business insights.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: Radix UI components with shadcn/ui design system
- **Styling**: Tailwind CSS with CSS custom properties for theming
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Development**: Hot module replacement and runtime error overlay via Vite plugins

### Backend Architecture
- **Framework**: Express.js with TypeScript running on Node.js
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Session Management**: Express sessions with PostgreSQL storage via connect-pg-simple
- **API Design**: RESTful endpoints with JSON request/response format
- **Error Handling**: Centralized error middleware with status code mapping
- **Rate Limiting**: Custom implementation tracking usage per user/session with daily resets

### Authentication System
- **Provider**: Replit Auth using OpenID Connect (OIDC)
- **Strategy**: Passport.js with OpenID Connect strategy
- **Session Storage**: PostgreSQL-backed sessions with configurable TTL
- **User Management**: Automatic user creation/updates on authentication
- **Security**: HTTPS-only cookies, CSRF protection, and secure session configuration

### Data Storage
- **Database**: PostgreSQL with Neon serverless connection pooling
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Tables**: Users, sessions (mandatory for Replit Auth), competitor reports, and rate limits
- **Data Types**: JSONB for flexible storage of competitor data and AI analysis results

### Signal Aggregation System
- **RSS Parsing**: Custom RSS/XML parser for news feeds and press releases
- **Signal Classification**: Automatic categorization of content (news, funding, social, product)
- **Content Filtering**: Relevance matching against competitor names and keywords
- **Source Management**: Support for multiple RSS feeds and public data sources

### AI Integration
- **Provider**: OpenAI API for natural language processing and summarization
- **Model**: GPT-5 for high-quality competitive intelligence analysis
- **Processing**: Structured prompts for consistent report generation
- **Output Format**: JSON-structured analysis with executive summaries and strategic insights

### Rate Limiting Strategy
- **Guest Users**: 1 competitor analysis per session
- **Logged-in Users**: 5 competitor analyses per day
- **Tracking**: Database-backed usage counters with daily reset mechanism
- **Enforcement**: Server-side validation with client-side usage indicators

### Report Generation Pipeline
1. **Input Processing**: Parse competitor names and optional RSS feed URLs
2. **Signal Collection**: Aggregate data from multiple sources concurrently
3. **Content Analysis**: Filter and categorize relevant signals using NLP
4. **AI Summarization**: Generate structured competitive intelligence reports
5. **Storage**: Persist reports for user history and future reference
6. **Delivery**: Real-time progress updates and newsletter-style formatting

## External Dependencies

### Core Services
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Replit Auth**: OIDC-based authentication and user management
- **OpenAI API**: GPT-5 model for AI-powered analysis and summarization

### Development Tools
- **Vite**: Frontend build tool with React plugin and development server
- **TypeScript**: Type safety across frontend, backend, and shared code
- **Drizzle Kit**: Database schema management and migration tools

### UI and Styling
- **Radix UI**: Accessible component primitives for form controls and overlays
- **Tailwind CSS**: Utility-first CSS framework with custom design tokens
- **Lucide React**: Icon library for consistent visual elements

### Data Processing
- **RSS/XML Parsing**: Custom implementation for feed processing
- **Date Utilities**: date-fns for timestamp manipulation and formatting
- **Content Classification**: Rule-based system for signal categorization

### Infrastructure
- **WebSocket Support**: ws library for Neon database connections
- **Session Storage**: connect-pg-simple for PostgreSQL-backed sessions
- **Process Management**: tsx for TypeScript execution in development