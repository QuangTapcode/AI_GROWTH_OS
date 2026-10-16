-- ============================================================================
-- AI GROWTH OS — Migration 002 ROLLBACK: Revert Workflow Tasks & Content Ledger
-- Target: PostgreSQL 17 + pgvector
-- Architecture: Revert 002 cleanly without affecting 001 Initial Core Schema
-- Owner: Thiệu Quang (Backend Core & Contracts Lead)
-- ============================================================================

-- 1. Hủy bảng Phê duyệt Approvals
DROP TABLE IF EXISTS approvals CASCADE;

-- 2. Hủy các cột bổ sung trên bảng contents
ALTER TABLE contents DROP COLUMN IF EXISTS artifact_id;
ALTER TABLE contents DROP COLUMN IF EXISTS context_snapshot_id;
ALTER TABLE contents DROP COLUMN IF EXISTS content_hash;
ALTER TABLE contents DROP COLUMN IF EXISTS current_version;

-- 3. Hủy bảng Lịch sử phiên bản nội dung
DROP TABLE IF EXISTS content_versions CASCADE;

-- 4. Hủy bảng Artifacts nội dung
DROP TABLE IF EXISTS content_artifacts CASCADE;

-- 5. Hủy bảng Quan hệ phụ thuộc Tác vụ (Task Dependencies)
DROP TABLE IF EXISTS task_dependencies CASCADE;

-- 6. Hủy bảng Nhiệm vụ Workflow (Workflow Tasks)
DROP TABLE IF EXISTS workflow_tasks CASCADE;
