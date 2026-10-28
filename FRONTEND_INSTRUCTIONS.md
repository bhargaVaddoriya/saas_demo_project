# Frontend Implementation Guide & API Contract
**Project Management SaaS (MERN Stack)**

> **Base URL:** `http://localhost:3001`  
> **API Mount:** All endpoints are mounted under `/api/*` (with direct root aliases supported: e.g. `/api/projects` and `/projects`).

---

## 1. Role-Based Access Control (RBAC) & Permissions

As outlined in the specification (Section 3 & 17), permissions are strictly enforced on the backend. Hiding a button in the frontend is not considered authorization; the backend will respond with `403 Forbidden` if unauthorized.

### Hierarchy & Capabilities

```
+---------------------------------------------------------------------------------+
| ORGANIZATION OWNER (Full control over organization, members, projects, audit)   |
+---------------------------------------------------------------------------------+
                                      |
+---------------------------------------------------------------------------------+
| ADMIN / MANAGER (Manage assigned projects, tasks, project members, analytics)   |
+---------------------------------------------------------------------------------+
                                      |
+---------------------------------------------------------------------------------+
| MEMBER (View assigned projects/tasks, update task status, add comments)        |
+---------------------------------------------------------------------------------+
```

| Operation | Organization Owner | Admin / Project Manager | Team Member |
| :--- | :---: | :---: | :---: |
| **Manage Organization (name, settings)** | ✅ Yes | ❌ No | ❌ No |
| **Invite / Remove Org Members** | ✅ Yes | ✅ Yes (Admin) | ❌ No |
| **Change Member Role (Admin/Member)** | ✅ Yes | ❌ No | ❌ No |
| **Create Projects** | ✅ Yes | ✅ Yes | ❌ No |
| **Edit / Archive Project** | ✅ Yes | ✅ Yes (Manager) | ❌ No |
| **Add / Remove Project Members** | ✅ Yes | ✅ Yes (Manager) | ❌ No |
| **Create / Edit / Archive Tasks** | ✅ Yes | ✅ Yes | ❌ (Unless assigned) |
| **Move Kanban Task Status** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Assign Task to User** | ✅ Yes | ✅ Yes | ❌ No |
| **Add Comments on Task** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Delete Comments** | ✅ Yes (All) | ✅ Yes (All) | ✅ Only Own Comment |
| **View Organization Dashboard & Audit** | ✅ Yes | ✅ Yes | ❌ (Own Scope Only) |

---

## 2. Authentication & Session Workflow

### 2.1 Request Headers
Every protected endpoint requires the `Authorization` header. If working within a multi-tenant context, optionally supply the active organization ID:
```http
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
x-organization-id: <ACTIVE_ORGANIZATION_ID>
```

### 2.2 Standard Response Envelopes
#### Success Response (`200 OK` / `201 Created`):
```json
{
  "success": true,
  "message": "Operation successful.",
  "data": { ... } // Also aliased to entity key (e.g. "projects", "task", "organization")
}
```

#### Paginated List Response:
All list endpoints return pagination metadata:
```json
{
  "success": true,
  "pagination": {
    "total": 35,
    "page": 1,
    "limit": 20,
    "totalPages": 2,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "projects": [ ... ],
  "data": [ ... ]
}
```

#### Validation Error (`400 Bad Request` from express-validator):
```json
{
  "success": false,
  "message": "Project name must be between 2 and 120 characters.",
  "errors": [
    {
      "field": "name",
      "message": "Project name must be between 2 and 120 characters.",
      "value": ""
    }
  ]
}
```

#### Authentication Error (`401 Unauthorized`):
```json
{
  "success": false,
  "message": "Session expired. Please log in again.",
  "expired": true
}
```
*Frontend Action:* Clear token/localStorage and navigate to `/login`.

#### Authorization Error (`403 Forbidden`):
```json
{
  "success": false,
  "message": "Access denied. Insufficient permissions to modify this project."
}
```
*Frontend Action:* Display toast/alert informing user they lack required permissions.

---

## 3. Common Query Parameters for Lists

The following query parameters are supported across all collection routes (`/api/projects/list`, `/api/tasks`, `/api/activity`, `/api/notifications`, `/api/comments/task/:taskId`):

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `page` | Integer | `1` | Current page number (1-indexed). |
| `limit` | Integer | `20` | Items per page (max 100). |
| `sortBy` | String | `createdAt` | Field to sort by (`title`, `name`, `status`, `priority`, `dueDate`, `createdAt`). |
| `order` | String | `desc` | Sort direction: `asc` or `desc`. |
| `search` | String | `""` | Case-insensitive keyword search across names, titles, and descriptions. |
| `organizationId` | String | Active Org | Scopes query to specific organization (also read from `x-organization-id` header). |

---

## 4. Endpoints Matrix & Payload Specifications

### 4.1 Authentication (`/api/auth` or `/authentication`)

#### 1. Register (`POST /api/auth/register` or `/authentication/signup`)
> Automatically registers user, provisions primary organization with unique `slug`, and sets user as `OWNER`.

**Request Body:**
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "Password123!",
  "organizationName": "Acme SaaS Corp" // Optional, defaults to "Jane Doe's Workspace"
}
```

**Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Account and organization registered successfully.",
  "token": "eyJhbGciOi...",
  "expiresIn": "24h",
  "user": {
    "id": "6ae1b4ded954ff23220ddabf",
    "_id": "6ae1b4ded954ff23220ddabf",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "isActive": true,
    "createdAt": "2026-10-28T08:39:00.000Z"
  },
  "organization": {
    "id": "6ae1b4ded954ff23220ddac0",
    "_id": "6ae1b4ded954ff23220ddac0",
    "name": "Acme SaaS Corp",
    "slug": "acme-saas-corp",
    "role": "OWNER"
  },
  "organizations": [ ... ]
}
```

#### 2. Login (`POST /api/auth/login` or `/authentication/login`)
**Request Body:**
```json
{
  "email": "jane@example.com",
  "password": "Password123!"
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Login successful.",
  "token": "eyJhbGciOi...",
  "expiresIn": "24h",
  "user": { ... },
  "organization": { "id": "...", "name": "...", "slug": "acme-saas-corp", "role": "OWNER" },
  "currentOrganization": { ... },
  "organizations": [ ... ]
}
```

#### 3. Current User Profile (`GET /api/auth/me` or `/authentication/me`)
**Headers:** `Authorization: Bearer <token>`  
**Response (`200 OK`):** Returns active user, current organization, and all joined organization memberships.

#### 4. Logout (`POST /api/auth/logout`)
Clears authentication cookie and session state.

---

### 4.2 Organizations (`/api/organizations`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/organizations` | Authenticated | Create a new organization (user becomes OWNER). |
| `GET` | `/api/organizations` | Authenticated | List all organizations the user belongs to. |
| `GET` | `/api/organizations/:idOrSlug` | Members | Get organization details (supports MongoDB `_id` or `slug`). |
| `PUT` | `/api/organizations/:idOrSlug` | OWNER / ADMIN | Update organization name, description. Slug auto-updates. |
| `GET` | `/api/organizations/:id/members` | Members | List members of organization with pagination. |
| `POST` | `/api/organizations/:id/members` | OWNER / ADMIN | Invite/add member by `email` or `userId`, with `role` (`ADMIN` or `MEMBER`). |
| `PATCH`| `/api/organizations/:id/members/:userId` | OWNER | Change member role (`ADMIN` or `MEMBER`). |
| `DELETE`| `/api/organizations/:id/members/:userId` | OWNER / ADMIN | Remove member (cannot remove organization owner). |

**Add Member Payload (`POST /api/organizations/:id/members`):**
```json
{
  "email": "colleague@example.com",
  "role": "MEMBER" // "ADMIN" or "MEMBER"
}
```

---

### 4.3 Projects (`/api/projects`)

#### 1. List Projects (`GET /api/projects` or `GET /api/projects/list`)
**Query Params:**
- `organizationId`: (Optional, auto-resolved from active org)
- `status`: `PLANNING` | `ACTIVE` | `ON_HOLD` | `COMPLETED` | `ARCHIVED`
- `priority`: `LOW` | `MEDIUM` | `HIGH` | `CRITICAL`
- `search`: Keyword string
- `page`: 1
- `limit`: 20

**Response (`200 OK`):**
```json
{
  "success": true,
  "pagination": { "total": 12, "page": 1, "limit": 20, "totalPages": 1 },
  "projects": [
    {
      "_id": "6ae1b4ded954ff23220ddac4",
      "name": "Mobile App Redesign",
      "description": "Flutter migration",
      "status": "ACTIVE",
      "priority": "HIGH",
      "organizationId": "6ae1b4ded954ff23220ddac0",
      "ownerId": { "_id": "...", "name": "Jane Doe", "email": "jane@example.com" },
      "createdAt": "2026-10-28T09:00:00.000Z"
    }
  ],
  "data": [ ... ]
}
```

#### 2. Create Project (`POST /api/projects`)
**Request Body:**
```json
{
  "name": "Mobile App Redesign",
  "description": "Flutter & React Native migration",
  "organizationId": "6ae1b4ded954ff23220ddac0", // Optional if x-organization-id header is sent
  "status": "ACTIVE", // PLANNING | ACTIVE | ON_HOLD | COMPLETED
  "priority": "HIGH", // LOW | MEDIUM | HIGH | CRITICAL
  "startDate": "2026-11-01T00:00:00.000Z", // Optional ISO date
  "dueDate": "2026-12-15T00:00:00.000Z"     // Optional ISO date
}
```

#### 3. Get Project By ID (`GET /api/projects/:id`)
Returns project details, user's role on this project (`myProjectRole`), and aggregated metrics (`totalTasks`, `completedTasks`, `progressPercentage`, `memberCount`).

#### 4. Update Project (`PUT /api/projects/:id`)
**Request Body (Partial):**
```json
{
  "name": "Updated Project Name",
  "status": "COMPLETED",
  "priority": "CRITICAL"
}
```

#### 5. Archive Project (`DELETE /api/projects/:id`)
Soft-deletes project and sets status to `ARCHIVED`.

#### 6. Project Progress Breakdown (`GET /api/projects/:id/progress`)
Returns task completion percentage and counts grouped by status (`TODO`, `IN_PROGRESS`, `IN_REVIEW`, `COMPLETED`).

#### 7. Project Members (`GET /api/projects/:id/members`, `POST /api/projects/:id/members`, `DELETE /api/projects/:id/members/:userId`)
Add or remove team members from specific projects with role `MANAGER` or `MEMBER`.

---

### 4.4 Tasks & Kanban Board (`/api/tasks`)

#### 1. Kanban Board Feed (`GET /api/tasks/kanban?projectId=<PROJECT_ID>`)
> Returns all tasks for the project pre-grouped into standard Kanban columns ordered by card sequence (`order`).

**Response (`200 OK`):**
```json
{
  "success": true,
  "columns": {
    "TODO": [
      {
        "_id": "task_1",
        "title": "Design Figma Mockups",
        "priority": "HIGH",
        "status": "TODO",
        "order": 0,
        "assigneeId": { "_id": "...", "name": "Alex" },
        "reporterId": { "_id": "...", "name": "Jane" },
        "dueDate": "2026-11-05T00:00:00.000Z",
        "labels": ["UI", "Figma"]
      }
    ],
    "IN_PROGRESS": [ ... ],
    "IN_REVIEW": [ ... ],
    "COMPLETED": [ ... ]
  },
  "totalCount": 8
}
```

#### 2. Kanban Drag-and-Drop Status Change (`PATCH /api/tasks/:id/status`)
> Call this immediately upon dropping a card into a new column or changing its column position.

**Request Body:**
```json
{
  "status": "IN_PROGRESS", // "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "COMPLETED"
  "order": 1               // Index position in column
}
```

#### 3. Assign / Unassign Task (`PATCH /api/tasks/:id/assignee`)
**Request Body:**
```json
{
  "assigneeId": "6ae1b4ded954ff23220ddabf" // Or null to unassign
}
```

#### 4. Create Task (`POST /api/tasks`)
**Request Body:**
```json
{
  "title": "Build Authentication Screen",
  "description": "Implement React Hook Form with validation",
  "projectId": "6ae1b4ded954ff23220ddac4",
  "status": "TODO",
  "priority": "HIGH",
  "assigneeId": "6ae1b4ded954ff23220ddabf", // Optional
  "dueDate": "2026-11-10T00:00:00.000Z",    // Optional
  "labels": ["Frontend", "React"]           // Optional array of strings
}
```

#### 5. List Tasks with Filters (`GET /api/tasks`)
**Query Params:**
- `projectId`: Scopes tasks to project
- `status`: `TODO` | `IN_PROGRESS` | `IN_REVIEW` | `COMPLETED`
- `priority`: `LOW` | `MEDIUM` | `HIGH` | `CRITICAL`
- `assigneeId`: Filter tasks assigned to specific user (or current user)
- `search`: Keyword string
- `sortBy`: `dueDate` | `priority` | `createdAt` | `title`
- `order`: `asc` | `desc`
- `page`: 1
- `limit`: 20

#### 6. Update Task Details (`PUT /api/tasks/:id`)
Accepts partial fields: `title`, `description`, `priority`, `dueDate`, `labels`, `status`.

#### 7. Delete / Archive Task (`DELETE /api/tasks/:id`)

---

### 4.5 Comments & Mentions (`/api/tasks/:taskId/comments` & `/api/comments/:id`)

#### 1. Add Comment (`POST /api/tasks/:taskId/comments`)
**Request Body:**
```json
{
  "content": "Looking great! Please review wireframes @alex.",
  "mentions": ["6ae1b4ded954ff23220ddabf"] // Optional user IDs mentioned
}
```
*Effect:* Records comment, generates activity log, and creates in-app notifications for mentioned users.

#### 2. Get Task Comments (`GET /api/tasks/:taskId/comments`)
Returns chronologically sorted comments (`createdAt: 1`) with populated author names and avatars.

#### 3. Edit Comment (`PUT /api/comments/:id`)
Author only. `{ "content": "Updated text" }`.

#### 4. Delete Comment (`DELETE /api/comments/:id`)
Allowed for comment author or organization Owner / Admin / Project Manager.

---

### 4.6 Activity / Audit Log (`/api/projects/:projectId/activity` & `/api/activity`)

Tracks who performed what action, when it happened, and which entity was affected.

- **Project Feed:** `GET /api/projects/:projectId/activity?page=1&limit=30`
- **Organization Audit:** `GET /api/activity?page=1&limit=30` (or `?organizationId=...`)

**Response Item Example:**
```json
{
  "_id": "act_123",
  "action": "TASK_STATUS_CHANGED",
  "summary": "Jane moved \"Design Figma Mockups\" from TODO to IN_PROGRESS",
  "userId": { "_id": "...", "name": "Jane Doe", "email": "jane@example.com" },
  "taskId": { "_id": "...", "title": "Design Figma Mockups" },
  "createdAt": "2026-10-28T09:15:00.000Z"
}
```

---

### 4.7 Dashboard & Analytics (`GET /api/dashboard` or `/api/analytics`)

**Query Param:** `organizationId` (Optional, auto-resolved from active org)

**Response Structure (`200 OK`):**
```json
{
  "success": true,
  "analytics": {
    "projects": {
      "total": 6,
      "active": 4,
      "completed": 2,
      "planning": 0
    },
    "tasks": {
      "total": 24,
      "completed": 10,
      "overdue": 3,
      "assignedToMe": 7,
      "byStatus": {
        "TODO": 5,
        "IN_PROGRESS": 6,
        "IN_REVIEW": 3,
        "COMPLETED": 10
      },
      "byPriority": {
        "LOW": 4,
        "MEDIUM": 12,
        "HIGH": 6,
        "CRITICAL": 2
      }
    },
    "recentProjects": [ ... ],
    "upcomingTasks": [ ... ]
  }
}
```

---

### 4.8 Notifications Center (`/api/notifications`)

- `GET /api/notifications?page=1&limit=20&isRead=false`: Returns unread alerts + unread count badge.
- `PATCH /api/notifications/:id/read`: Marks a single notification as read.
- `PATCH /api/notifications/read-all`: Marks all notifications as read for current user.

---

## 5. End-to-End User Experience Workflow (Screen-by-Screen)

```
[1. Register / Login] ──> Saves token & active org slug/id to Redux/Zustand & localStorage
          │
          ├───> [2. Dashboard Screen] ──> GET /api/dashboard (Charts for status & priority)
          │
          ├───> [3. Project List Screen] ──> GET /api/projects/list (Filter by status/priority)
          │             │
          │             └───> [4. Project Details] ──> GET /api/projects/:id (Progress bar)
          │                         │
          │                         └───> [5. Kanban Board Screen]
          │                                   │──> GET /api/tasks/kanban?projectId=...
          │                                   │──> Drag-and-drop: PATCH /api/tasks/:id/status
          │                                   │──> Click card: Task Details Modal + Comments
          │
          ├───> [6. Organization Settings] ──> GET /api/organizations/:slug/members
          │             │──> Invite Member: POST /api/organizations/:id/members
          │             │──> Update Role: PATCH /api/organizations/:id/members/:userId
          │
          └───> [7. Notification Bell] ──> Polling GET /api/notifications (Unread badge)
```
