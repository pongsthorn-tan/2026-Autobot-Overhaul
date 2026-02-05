# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **Task editing** — Edit task params, model, and budget after creation via PATCH `/api/tasks/:taskId`. Inline edit form on task detail page renders service-specific fields (prompt, topic, maxSteps, preset, spending limits, etc.). (`be1d8d4`)
- **Pause/resume scheduled tasks** — POST `/api/tasks/:taskId/pause` unschedules callbacks and sets status to "paused"; POST `/api/tasks/:taskId/resume` re-registers callbacks and restores "scheduled" status. (`be1d8d4`)
- **Remove schedule** — Send `{ schedule: null }` via PATCH to clear a task's schedule entirely. (`be1d8d4`)
- **"paused" task status** — New status in `StandaloneTaskStatus` union, with orange badge in task list and detail page. (`be1d8d4`)
- Inline Pause/Resume buttons in task list for scheduled/paused tasks.

### Changed
- **Consolidated Intel forms** — Merged Report, Research, and Topic Tracker into a single Intel tab with a style selector (Report / Research / Topic Tracker pills). Reduced task page from 5 tabs to 3: Intel, Code Task, Self-Improve. (`abd72b7`)
- **Human-readable task IDs** — Replaced UUID-based task IDs with slug-based IDs using `generateTaskId()`. Example: `report-ai-breakthroughs-2026-02-04T1312`. (`4130680`)
- **Removed Docker** — Deleted Dockerfile, docker-compose.yml, nginx config, and .dockerignore. Project now runs directly via `npm start` + `cd web-ui && npm run dev`. (`390854c`)

### Added
- Intel task list shows style badges (Report / Research / Tracker) with distinct colors per task type.
- Old URL params (`?service=report`, `?service=research`, `?service=topic-tracker`) redirect to `?service=intel`.

### Removed
- `task-form-report.tsx`, `task-form-research.tsx`, `task-form-topic-tracker.tsx` (replaced by `task-form-intel.tsx`)
- Dockerfile, nginx.Dockerfile, docker-compose.yml, docker-entrypoint.sh, nginx.conf, .dockerignore

---

## 2026-02-04

### Added
- Standardized date format to dd/MMM/yyyy with deploy timestamp as version (`d077ffe`)
- Enhanced base service, dashboard UI, cost control, and live log component (`963e1c3`)
- Branching tree structure for topic tracker (`dd4e87c`)
- Live log streaming with SSE for task and refinement jobs (`b4905d6`)
- Redesigned report renderer with colorful visual styling (`a76dd7d`)

### Changed
- Consolidated report, research, topic-tracker backend services into `services/intel/` module (`e840268`)

### Fixed
- Live log streaming issues and added sources section to reports (`b4905d6`)
- Report renderer handles string items in key-findings (`9cf4ffd`)
