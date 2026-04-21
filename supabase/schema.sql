-- ============================================================
-- ThoughtBox V1.7 云同步数据库结构
-- Supabase SQL 建表脚本 + RLS 策略
-- ============================================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 表 1: user_sync_state - 用户当前同步状态（单条记录，upsert）
-- ============================================================
CREATE TABLE IF NOT EXISTS user_sync_state (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    payload_json JSONB NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by_device_id TEXT NOT NULL,
    item_counts JSONB NOT NULL DEFAULT '{"records": 0, "syntheses": 0, "briefs": 0}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 注释
COMMENT ON TABLE user_sync_state IS '用户数据同步状态，每个用户只有一条记录，存储当前云端快照';
COMMENT ON COLUMN user_sync_state.payload_json IS '完整的 AppSnapshot JSON 数据';
COMMENT ON COLUMN user_sync_state.schema_version IS '快照结构版本号，用于后续兼容性处理';
COMMENT ON COLUMN user_sync_state.updated_by_device_id IS '最后更新此数据的设备ID';
COMMENT ON COLUMN user_sync_state.item_counts IS '各类型数据数量统计';

-- 索引
CREATE INDEX IF NOT EXISTS idx_user_sync_state_updated_at ON user_sync_state(updated_at);

-- ============================================================
-- 表 2: user_sync_backups - 用户同步历史备份
-- ============================================================
CREATE TABLE IF NOT EXISTS user_sync_backups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_device_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1
);

-- 注释
COMMENT ON TABLE user_sync_backups IS '用户数据同步历史备份，保留最近几次的同步快照';
COMMENT ON COLUMN user_sync_backups.reason IS '创建备份的原因，如 manual_backup, before_merge, auto_backup';

-- 索引
CREATE INDEX IF NOT EXISTS idx_user_sync_backups_user_id ON user_sync_backups(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sync_backups_created_at ON user_sync_backups(created_at);

-- ============================================================
-- RLS (Row Level Security) 策略
-- ============================================================

-- 启用 RLS
ALTER TABLE user_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sync_backups ENABLE ROW LEVEL SECURITY;

-- 策略：用户只能查看自己的 sync_state
CREATE POLICY "Users can view own sync state"
    ON user_sync_state
    FOR SELECT
    USING (auth.uid() = user_id);

-- 策略：用户只能插入/更新自己的 sync_state
CREATE POLICY "Users can insert own sync state"
    ON user_sync_state
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sync state"
    ON user_sync_state
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 策略：用户只能删除自己的 sync_state
CREATE POLICY "Users can delete own sync state"
    ON user_sync_state
    FOR DELETE
    USING (auth.uid() = user_id);

-- 策略：用户只能查看自己的 backups
CREATE POLICY "Users can view own backups"
    ON user_sync_backups
    FOR SELECT
    USING (auth.uid() = user_id);

-- 策略：用户只能插入自己的 backups
CREATE POLICY "Users can insert own backups"
    ON user_sync_backups
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 策略：用户只能删除自己的 backups（用于清理旧备份）
CREATE POLICY "Users can delete own backups"
    ON user_sync_backups
    FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================
-- 清理旧备份的函数（保留最近 10 条）
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_old_backups()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM user_sync_backups
    WHERE user_id = NEW.user_id
    AND id NOT IN (
        SELECT id FROM user_sync_backups
        WHERE user_id = NEW.user_id
        ORDER BY created_at DESC
        LIMIT 10
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 触发器：插入新备份后自动清理旧备份
DROP TRIGGER IF EXISTS trigger_cleanup_backups ON user_sync_backups;
CREATE TRIGGER trigger_cleanup_backups
    AFTER INSERT ON user_sync_backups
    FOR EACH ROW
    EXECUTE FUNCTION cleanup_old_backups();

-- ============================================================
-- 使用说明
-- ============================================================
/*
1. 在 Supabase Dashboard 中执行此 SQL 脚本

2. 获取项目配置：
   - Project URL: https://<project-ref>.supabase.co
   - Anon Key: 在 Project Settings > API > Project API keys 中获取

3. 在 ThoughtBox 同步设置页中填入：
   - Supabase 地址: https://<project-ref>.supabase.co
   - Publishable Key: <your-anon-key>

4. 安全配置：
   - 不要在前端使用 service_role key
   - 确保 RLS 已启用（本脚本已启用）
   - 如需更严格的限制，可添加额外的策略

5. 备份策略：
   - 自动保留最近 10 条备份
   - 可通过 user_sync_backups 表查看历史
*/
