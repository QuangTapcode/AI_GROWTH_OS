-- ==============================================================================
-- Rollback Migration: 004_reports_exceptions_outbox.down.sql
-- Description: Rollback Metric Snapshots, Exceptions, and Outbox Tables (TQ-07)
-- Sprint: Week 3 - Day 12
-- Owner: Thiệu Quang (Backend Core & Contracts Lead)
-- ==============================================================================

DROP TABLE IF EXISTS outbox_events CASCADE;
DROP TABLE IF EXISTS system_exceptions CASCADE;
DROP TABLE IF EXISTS metrics_snapshots CASCADE;
