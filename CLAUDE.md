# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ECME is a Next.js 15 admin dashboard template built with TypeScript, React 19, and Tailwind CSS 4. It provides a highly customizable platform for building admin interfaces with multiple layout options, theming, and i18n support.

## Commands

```bash
# Development (runs on port 3001 with Turbopack)
npm run dev

# Build
npm run build

# Start production server
npm start

# Lint
npm run lint

# Format check
npm run prettier

# Format fix
npm run prettier:fix
```

## Architecture

### Directory Structure

- `src/app/` - Next.js App Router pages organized by route groups:
  - `(auth-pages)/` - Authentication pages (sign-in, sign-up, forgot-password)
  - `(protected-pages)/` - Authenticated routes (dashboards, concepts, ui-components, guide)
  - `(public-pages)/` - Public routes (landing page)
  - `api/` - API routes

- `src/components/` - React components:
  - `ui/` - Base UI components (Button, Card, Dialog, Input, etc.)
  - `template/` - Layout components (Header, Navigation, SideNav, ThemeConfigurator)
  - `shared/` - Reusable business components (Chart, RichTextEditor, GanttChart)
  - `auth/` - Authentication form components
  - `layouts/` - Page layout wrappers
  - `view/` - View-specific components

- `src/configs/` - Application configuration:
  - `app.config.ts` - App settings (apiPrefix, entry paths, locale)
  - `theme.config.ts` - Theme settings (direction, mode, layout type)
  - `auth.config.ts` - NextAuth configuration with OAuth providers
  - `routes.config/` - Route definitions and access control
  - `navigation.config/` - Sidebar navigation structure

- `src/services/` - API service layer using Axios
- `src/utils/` - Utility functions
- `src/constants/` - Application constants including theme constants
- `src/@types/` - TypeScript type definitions
- `src/i18n/` - Internationalization setup
- `messages/` - Translation files (en, es, zh, ar)

### Key Patterns

**Path Aliases**: Use `@/` for imports from `src/` (configured in tsconfig.json)

**Theming**: CSS variables for colors defined in Tailwind config. Theme modes: light/dark. Layout types: collapsibleSide, stackedSide, topBarClassic, framelessSide, contentOverlay

**Authentication**: NextAuth v5 with Credentials, GitHub, and Google providers. Middleware handles route protection in `src/middleware.ts`

**State Management**: Zustand for local state (see `_store/` folders in feature directories)

**Data Fetching**: SWR for client-side data fetching, Axios via ApiService for API calls

**i18n**: next-intl for internationalization with RTL support

**Forms**: react-hook-form with zod validation

### UI Component Library

Custom UI components in `src/components/ui/` follow a consistent pattern:
- Component file with implementation
- Index file for exports
- CSS styles in `src/assets/styles/components/`
