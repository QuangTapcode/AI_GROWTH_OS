-- ==============================================================================
-- Rollback Migration: 003_leads_persistence.down.sql
-- Description: Rollback Lead Persistence & Sales Handoff Schema
-- Sprint: Week 2 - Day 8 (TQ-05 / DU-05)
-- Owner: Thiệu Quang (Backend Core & Contracts Lead)
-- ==============================================================================

DROP TABLE IF EXISTS leads CASCADE;
