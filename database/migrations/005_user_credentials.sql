-- ============================================================================
-- AI GROWTH OS — Migration 005: First-party login credentials
-- Target: PostgreSQL 17
-- Mật khẩu chỉ lưu dạng scrypt hash (apps/api/src/lib/password.ts), không lưu plaintext.
-- User chưa đặt mật khẩu (password_hash NULL) không đăng nhập được bằng email/mật khẩu.
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Login tra cứu email không phân biệt hoa/thường
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
