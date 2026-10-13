# Plan: Authentication System (JWT + API Keys)

## Objective
Add authentication and authorization to protect endpoints, enable multi-user support, and provide API key management for programmatic access.

## Current State
- No authentication - all endpoints public
- Single-user assumption in services
- No rate limiting per user
- Telegram/AI endpoints exposed

## Requirements

### Authentication Methods
1. **JWT Bearer Tokens** - For web UI and interactive use
2. **API Keys** - For programmatic access (CLI, integrations)
3. **Session Cookies** - Optional for web UI

### User Roles
| Role | Permissions |
|------|-------------|
| `admin` | Full access: manage users, feeds, templates, system config |
| `user` | Read news, generate content, bookmark, manage own templates |
| `viewer` | Read-only: view news, feeds, health |

### Protected Endpoints
| Endpoint | Required Role |
|----------|---------------|
| `GET /api/news` | viewer |
| `POST /api/news` | user |
| `POST /api/ai/generate` | user |
| `POST /api/ai/generate/stream` | user |
| `POST /api/telegram/send` | user |
| `POST /api/telegram/schedule` | user |
| `GET/POST/DELETE /api/telegram/queue*` | user |
| `GET/POST/PUT/DELETE /api/templates*` | user (own), admin (all) |
| `GET /api/bookmarks` | user |
| `POST/DELETE /api/bookmarks` | user |
| `GET/PUT /api/ai/profile` | user |
| `POST /api/ai/score*` | user |
| `GET/PUT /api/newsletter/config` | admin |
| `POST /api/newsletter/trigger` | admin |
| `GET /api/feeds` | viewer |
| `POST/PUT/DELETE /api/feeds*` | admin |
| `GET /api/stats` | viewer |
| `GET /api/feeds/health` | admin |
| `GET/POST /api/feeds/opml` | admin |
| **Public** | |
| `GET /health` | none |
| `GET /` | none |

## Implementation Phases

### Phase 1: Database Schema (✅ Done)
- `users` table exists with: id, email, name, password_hash, role, created_at, updated_at
- `api_keys` table exists with: id, user_id, name, key_hash, created_at, last_used_at
- Unique constraints on email and key_hash
- Foreign key from api_keys to users (cascade delete)

### Phase 2: Auth Service & Middleware (✅ Done)
- `services/auth.service.js` - Core auth logic (register, login, password hash, user CRUD)
- `services/jwt.service.js` - JWT sign/verify (access + refresh tokens)
- `services/api-key.service.js` - API key generation/validation/revocation
- `middleware/auth.js` - Request authentication middleware with role-based access

### Phase 3: User Management API (✅ Done)
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login, return JWT
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Current user profile
- `PUT /api/auth/me` - Update profile
- `POST /api/auth/change-password` - Change password
- `POST /api/auth/api-key` - Generate new API key
- `GET /api/auth/api-keys` - List API keys
- `DELETE /api/auth/api-key/:id` - Revoke API key
- `GET /api/users` - List users (admin)
- `PUT /api/users/:id` - Update user role (admin)
- `DELETE /api/users/:id` - Delete user (admin)
- `POST /api/auth/init-admin` - Create default admin (first run only)

### Phase 4: Integration (✅ Done)
- Auth routes integrated in server.js (`/api/auth/*`)
- Auth middleware applied to protected endpoints:
  - `requireViewer()` - GET /api/news, /api/templates, /api/stats, /api/feeds
  - `requireUser()` - POST /api/news, /api/ai/generate, /api/telegram/*, /api/templates (write)
  - `requireAdmin()` - /api/feeds (write), /api/telegram/worker/*, /api/users
- Default admin created on first run (ADMIN_EMAIL/ADMIN_PASSWORD env vars)

### Phase 5: Tests (✅ Done)
- Auth service unit tests pass
- JWT verification works
- API key verification works
- Role-based access control enforced

## Technical Details

### JWT Structure
```json
{
  "sub": "user-id",
  "email": "user@example.com",
  "role": "user",
  "iat": 1234567890,
  "exp": 1234567890
}
```

### API Key Format
- Prefix: `rsk_` (RSS News Hub Key)
- 32 bytes random (base64url)
- Stored hashed (SHA-256)

### Token Storage
- Access token: 15 min expiry (HS256)
- Refresh token: 7 days expiry (HS256)
- API key: No expiry, revocable

### Password Hashing
- Argon2id via `@node-rs/argon2`

## File Structure
```
services/
  auth.service.js       # User CRUD, password hash, session management
  jwt.service.js        # JWT sign/verify, token refresh
  api-key.service.js    # API key generation, validation, revocation
middleware/
  auth.js               # Request authentication middleware
routes/
  auth.routes.js        # Auth endpoints
```

## Acceptance Criteria
- [x] Users can register/login via API
- [x] JWT tokens work for authentication
- [x] API keys work for programmatic access
- [x] Role-based access control enforced
- [x] Default admin created on first run
- [x] Auth service unit tests pass
- [x] JWT verification works
- [x] API key verification works