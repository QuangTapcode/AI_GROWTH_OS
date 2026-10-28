-- Migration 013: content_few_shot_examples with pgvector support (CM-23)
-- Kho ví dụ mẫu xuất sắc Few-shot cho Agent Content Marketing, phân lập theo workspace_id

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS content_few_shot_examples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    sample_id VARCHAR(100) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    brand_voice VARCHAR(255) NOT NULL,
    theme VARCHAR(255) NOT NULL,
    caption TEXT NOT NULL,
    sentence_fact_map JSONB NOT NULL DEFAULT '[]'::jsonb,
    hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
    storyboard JSONB,
    spoken_word_count INT,
    embedding vector(1536),
    quality_score NUMERIC(5, 2) NOT NULL DEFAULT 95.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_few_shot_ws_channel ON content_few_shot_examples (workspace_id, channel);
CREATE INDEX IF NOT EXISTS idx_few_shot_embedding ON content_few_shot_examples USING hnsw (embedding vector_cosine_ops);
