-- Online-first catalog migration for FreeMusicPlayer.
-- Safe to run more than once only after checking whether these columns already exist.

ALTER TABLE `tb_song`
    ADD COLUMN `source` varchar(20) NOT NULL DEFAULT 'local' COMMENT 'local/legacy-local/netease/tencent/kugou/kuwo/baidu' AFTER `id`,
    ADD COLUMN `source_song_id` varchar(100) NULL COMMENT 'upstream song id' AFTER `source`,
    ADD COLUMN `source_url_id` varchar(100) NULL COMMENT 'upstream id used to resolve audio' AFTER `source_song_id`,
    ADD COLUMN `source_pic_id` varchar(255) NULL COMMENT 'upstream id used to resolve cover' AFTER `source_url_id`,
    ADD COLUMN `media_status` varchar(20) NOT NULL DEFAULT 'active' COMMENT 'active/disabled/unavailable' AFTER `source_pic_id`,
    ADD UNIQUE KEY `uk_song_source_id` (`source`, `source_song_id`),
    ADD INDEX `idx_song_media_status` (`media_status`),
    MODIFY COLUMN `release_time` date NULL COMMENT '歌曲发行时间';

-- The SQL snapshot references media objects that were not distributed with the repository.
UPDATE `tb_song`
SET `source` = 'legacy-local',
    `media_status` = 'disabled'
WHERE (`audio_url` LIKE 'http://localhost:9000/%'
    OR `cover_url` LIKE 'http://localhost:9000/%');
