# LLMeter Auth Backend (NestJS)

Handles authentication for the LLMeter desktop app: email/password plus Google and GitHub OAuth, issuing JWT access + refresh tokens. SQLite via Prisma.

## Stack

- NestJS 10, Passport
- Prisma + SQLite
- JWT access token (15m) + refresh token (7d, rotated, stored hashed)
- bcrypt for password and refresh-token hashing

## Setup

```
cd auth-backend
bun install
cp .env.example .env          # then edit secrets / OAuth keys
bun run prisma:generate
bun run prisma:migrate        # creates the SQLite DB + tables
bun run start:dev
```

Server runs on `http://localhost:${process.env.PORT}`.

## Environment

See `.env.example`. Set strong `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (e.g. `openssl rand -hex 32`). OAuth keys are optional: email/password works with none set. If a provider's keys are absent, its strategy is simply not registered and `/auth/<provider>` returns an error.

### Google OAuth

Create credentials at https://console.cloud.google.com/apis/credentials (OAuth client, type "Web application"). Add authorized redirect URI `http://localhost:${process.env.PORT}/auth/google/callback`. Put the client ID/secret in `.env`.

### GitHub OAuth

Settings > Developer settings > OAuth Apps > New. Authorization callback URL `http://localhost:${process.env.PORT}/auth/github/callback`. Put the client ID/secret in `.env`.

## Endpoints

| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| POST | `/auth/register` | - | `{ email, password, name? }` -> `{ user, accessToken, refreshToken }` |
| POST | `/auth/login` | - | `{ email, password }` -> tokens |
| POST | `/auth/refresh` | Bearer refresh | rotates and returns a new pair |
| POST | `/auth/logout` | Bearer access | clears the stored refresh hash |
| GET | `/auth/me` | Bearer access | current user profile |
| GET | `/auth/google` | - | redirects to Google |
| GET | `/auth/google/callback` | - | redirects to `OAUTH_SUCCESS_REDIRECT?accessToken=...&refreshToken=...` |
| GET | `/auth/github` | - | redirects to GitHub |
| GET | `/auth/github/callback` | - | same redirect contract as Google |
| GET | `/auth/success` | - | confirmation page the desktop app intercepts |

## How the desktop OAuth flow works

The Electron app opens a popup to `/auth/<provider>`. After the provider authenticates, the backend redirects to `OAUTH_SUCCESS_REDIRECT` with the tokens in the query string. The desktop app intercepts that redirect, reads the tokens, stores them locally, and closes the popup. Tokens never round-trip through a third-party page.

## Structure

```
src/
  main.ts                  bootstrap, CORS, validation
  app.module.ts
  prisma/                  global PrismaService + module
  users/                   UsersService (find/create/update, public mapper)
  auth/
    auth.controller.ts     routes
    auth.service.ts        register/login/oauth/refresh/logout logic
    tokens.service.ts      sign + hash/compare tokens
    dto/auth.dto.ts        validated request bodies
    strategies/            jwt, jwt-refresh, google, github
    guards/guards.ts       guard classes
```
