# PR Manager

A beautiful menubar app to manage your Pull Requests across GitHub and GitLab.

**This is proprietary software. See [LICENSE](./LICENSE) for terms.**

## Project Structure

This is a monorepo containing three packages:

```
pr-manager/
├── packages/
│   ├── app/           # Electron desktop application
│   ├── backend/       # Node.js API server (auth, subscriptions)
│   └── landing/       # Marketing website (Astro)
├── docs/
│   └── legal/         # Legal documents (EULA, Privacy, Terms)
├── .github/
│   └── workflows/     # CI/CD pipelines
└── LICENSE            # Proprietary license
```

## Features

- **Menubar Integration**: Quick access to your PRs from the system tray
- **Multi-Provider Support**: Works with GitHub and GitLab
- **Custom Views**: Create filtered views for different PR categories
- **Desktop Notifications**: Get notified about PR updates
- **Dark/Light Theme**: Adapts to your system preferences
- **Local Search**: Quickly find PRs across all your repositories

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL (for backend)
- Stripe account (for payments)

### Installation

```bash
# Install all dependencies
npm install

# Start the Electron app
npm run app:dev

# Start the backend (requires .env setup)
npm run backend:dev

# Start the landing page
npm run landing:dev
```

### Environment Variables

#### Backend (`packages/backend/.env`)

```env
DATABASE_URL="postgresql://..."
JWT_SECRET="your-secret"
STRIPE_SECRET_KEY="sk_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_MONTHLY="price_..."
STRIPE_PRICE_YEARLY="price_..."
FRONTEND_URL="https://prmanager.app"
```

#### App (`packages/app/.env`)

```env
VITE_API_URL="https://api.prmanager.app"
```

## Building

```bash
# Build the Electron app
npm run app:make

# Build for specific platforms
npm run app:make:mac
npm run app:make:win
npm run app:make:linux

# Build the backend
npm run backend:build

# Build the landing page
npm run landing:build
```

## Deployment

### Backend

The backend is deployed to Railway. Push to `main` branch triggers automatic deployment.

Required secrets:
- `RAILWAY_TOKEN`

### Landing Page

The landing page is deployed to Vercel. Push to `main` branch triggers automatic deployment.

Required secrets:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

### App

The app is built and distributed through:
- Direct download from https://prmanager.app/download
- Mac App Store (optional)
- Microsoft Store (optional)

## Tech Stack

### App
- Electron 39
- Vue 3
- TypeScript
- Vite

### Backend
- Node.js
- Express
- Prisma ORM
- PostgreSQL
- Stripe

### Landing
- Astro
- Tailwind CSS

## License

This software is proprietary. See [LICENSE](./LICENSE) for details.

Copyright (c) 2026 Daniel Lopez Martinez. All rights reserved.
