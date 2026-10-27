-- 015_community_inbox.sql
-- Bảng tiếp nhận tin nhắn, bình luận cộng đồng (Facebook, Messenger, Website) và trạng thái xử lý
CREATE TABLE IF NOT EXISTS community_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL DEFAULT 'manual' CHECK (platform IN ('facebook_comment', 'facebook_message', 'website_comment', 'manual', 'tripc_chat')),
  external_id VARCHAR(255),
  author_name VARCHAR(255) NOT NULL,
  author_contact VARCHAR(255),
  content TEXT NOT NULL,
  post_url TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'queued', 'replied', 'escalated', 'ignored')),
  task_id UUID REFERENCES workflow_tasks(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(lead_id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_messages_workspace_status ON community_messages (workspace_id, status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_messages_task_id ON community_messages (task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_community_messages_lead_id ON community_messages (lead_id) WHERE lead_id IS NOT NULL;
