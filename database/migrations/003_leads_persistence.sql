-- ==============================================================================
-- Migration: 003_leads_persistence.sql
-- Description: Core Schema for Lead Persistence, Idempotency, Contact Dedup & Sales Handoff
-- Sprint: Week 2 - Day 8 (TQ-05 / DU-05)
-- Owner: Thiệu Quang (Backend Core & Contracts Lead)
-- Reviewers: Mỹ + Thiệu
-- ==============================================================================

CREATE TABLE IF NOT EXISTS leads (
    lead_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    site_id VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    phone_number VARCHAR(50),
    interest_topic VARCHAR(100),
    consent_accepted BOOLEAN NOT NULL DEFAULT true,
    consent_policy_version VARCHAR(64) NOT NULL,
    utm_source VARCHAR(128),
    utm_medium VARCHAR(128),
    utm_campaign VARCHAR(128),
    utm_content VARCHAR(128),
    context JSONB NOT NULL DEFAULT '{}'::jsonb,
    lead_status VARCHAR(50) NOT NULL DEFAULT 'New' CHECK (lead_status IN ('New', 'Assigned', 'Contacted', 'Converted', 'Archived')),
    lead_owner UUID REFERENCES users(user_id) ON DELETE SET NULL,
    notes TEXT,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_leads_workspace_idempotency UNIQUE (workspace_id, idempotency_key)
);

-- Indexes for performance, contact dedup, filtering & tenancy isolation
CREATE INDEX IF NOT EXISTS idx_leads_workspace_email ON leads(workspace_id, contact_email);
CREATE INDEX IF NOT EXISTS idx_leads_workspace_status ON leads(workspace_id, lead_status, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_workspace_owner ON leads(workspace_id, lead_owner);
CREATE INDEX IF NOT EXISTS idx_leads_workspace_captured_at ON leads(workspace_id, captured_at DESC);
