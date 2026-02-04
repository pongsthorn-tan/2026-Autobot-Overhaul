# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
