-- Upgrade a FreeMusicPlayer database for the enhanced multi-provider
-- integration. Existing databases should run this once; fresh databases run
-- it automatically after 20261021_online_catalog.sql via compose.dev.yml.
ALTER TABLE `tb_song`
    MODIFY COLUMN `source_pic_id` varchar(1000) NULL COMMENT 'upstream id or original cover URL',
    ADD COLUMN `source_extra` text NULL COMMENT 'opaque upstream metadata JSON' AFTER `source_pic_id`,
    ADD COLUMN `provider_engine` varchar(30) NULL COMMENT 'meting/go-music-api' AFTER `source_extra`;
