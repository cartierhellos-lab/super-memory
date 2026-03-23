-- 修复 proxy_audit.proxy_id 与 proxies.id 类型不一致导致的外键错误
-- 错误信息: Referencing column 'proxy_id' and referenced column 'id' in foreign key
--           constraint 'fk_proxy_audit_proxy' are incompatible.
-- 用法: 若 proxy_audit 已存在且 proxy_id 为 BIGINT UNSIGNED，在 massmail 库下执行本脚本。
-- 执行前建议备份: mysqldump -u root -p massmail > backup_$(date +%F).sql
-- 步骤 1 为幂等（仅当外键存在时 DROP），MySQL 5.7+ 均可执行。

USE massmail;

-- 可选：执行前检查 proxy_id 是否超出 INT 范围（若有结果请先手动处理后再迁移）
-- SELECT proxy_id FROM proxy_audit WHERE proxy_id > 2147483647 OR proxy_id < -2147483648 LIMIT 10;

SET @old_fk_checks = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- 1) 仅当外键存在时删除（幂等，MySQL 5.7+ 可用）
SELECT COUNT(*) INTO @fk_exists
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'proxy_audit' AND CONSTRAINT_NAME = 'fk_proxy_audit_proxy';
SET @drop_sql = IF(@fk_exists > 0, 'ALTER TABLE proxy_audit DROP FOREIGN KEY fk_proxy_audit_proxy', 'SELECT 1 AS _noop');
PREPARE stmt FROM @drop_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) 统一类型：proxy_id 改为 INT NULL（与 proxies.id INT 一致）
ALTER TABLE proxy_audit MODIFY proxy_id INT NULL;

-- 3) 重新添加外键（ON DELETE SET NULL 避免删除代理时产生孤儿约束错误）
ALTER TABLE proxy_audit
  ADD CONSTRAINT fk_proxy_audit_proxy
  FOREIGN KEY (proxy_id) REFERENCES proxies(id)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

SET FOREIGN_KEY_CHECKS = @old_fk_checks;

SELECT 'migrate_proxy_audit_fk 执行完成' AS result;
