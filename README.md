# Project Management SaaS Backend

Production-ready Project Management SaaS application backend built using Node.js, Express, and MongoDB (Mongoose).

---

## 1. Project Overview
A multi-tenant Project Management SaaS designed to allow organizations to manage projects, team members, Kanban tasks, comments, activity audit streams, and real-time project analytics from a centralized workspace.

---

## 2. Key Features
- **Multi-Tenant Architecture**: Strict organizational isolation via `organizationId` and unique workspace `slug`s.
- **Authentication & RBAC**: JWT authentication (24h validity), password hashing with bcrypt, role-based access control (`OWNER`, `ADMIN`, `MEMBER`).
- **Organization & Member Management**: Email invitations, token-based verification/acceptance, cascading cleanup on member removal.
- **Project Management**: Lifecycle tracking (`PLANNING`, `ACTIVE`, `ON_HOLD`, `COMPLETED`, `ARCHIVED`), member assignments, progress analytics.
- **Kanban Task Board**: Column groupings (`TODO`, `IN_PROGRESS`, `IN_REVIEW`, `COMPLETED`), drag-and-drop order persistence (`order` field), priority management (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
- **Comments & Mentions**: Task discussions with `@user` mentions and in-app notifications.
- **Activity / Audit Log**: Immutable activity stream recording critical actions (who, what, when, which task/project).
- **Dashboard & Analytics**: Aggregated real-time metrics for tasks by status, tasks by priority, overdue tasks, and project velocity.
- **Pagination & Filtering**: Reusable utility supporting search, multi-field sorting, and pagination across all collection routes.

---

## 3. Tech Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB Atlas with Mongoose ODM
- **Authentication**: JSON Web Tokens (`jsonwebtoken`) & `bcryptjs`
- **Validation**: `express-validator`
- **Email Service**: `nodemailer` (Ethereal test accounts in development / SMTP in production)

---

## 4. Architecture & Security
- **Multi-Tenant Boundary**: All child documents (`Project`, `ProjectMember`, `Task`, `Comment`, `ActivityLog`) are strictly partitioned by `organizationId`.
- **Cascading Logic**:
  - Archiving a project soft-archives all associated tasks.
  - Removing a member from an organization unassigns their active tasks and purges their project memberships.
- **Audit Immutability**: `ActivityLog` documents are immutable (`updatedAt: false`).

---

## 5. Database Collections
- `db_users`: User authentication, profile, and timestamps.
- `db_organizations`: Workspace details, owner reference, unique `slug`.
- `db_organization_members`: Organization membership and roles (`OWNER`, `ADMIN`, `MEMBER`).
- `db_projects`: Project metadata, priority, status, dates, owner reference.
- `db_project_members`: Project-level roles (`MANAGER`, `MEMBER`).
- `db_tasks`: Kanban cards, column sequence (`order`), status, priority, due date.
- `db_comments`: Discussion threads and user mentions.
- `db_activity_logs`: Immutable audit trails.
- `db_notifications`: In-app notification center.
- `db_invitations`: Email invitations and 7-day acceptance tokens.

---

## 6. Environment Variables
Create a `.env` file in the root directory (refer to `.env.example`):
```env
PORT=3001
NODE_ENV=development
MONGO_URL=mongodb+srv://<username>:<password>@cluster.mongodb.net/Backend_task
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=24h
FRONTEND_URL=http://localhost:5173
```

---

## 7. Local Setup Instructions
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your MongoDB Atlas URI and JWT Secret

# 3. Start development server
npm run dev
```

Server runs on: `http://localhost:3001`  
API prefix: `http://localhost:3001/api`

---

## 8. API Documentation
Refer to [FRONTEND_INSTRUCTIONS.md](./FRONTEND_INSTRUCTIONS.md) for full payload structures, query parameters, and workflow details.
