-- Provider metadata URLs (go-music-api ids/extra JSON + meting fallback params) are
-- far longer than the legacy 255-character columns; importOnline failed with
-- "Data too long for column 'cover_url'" and the favorite chain never got a song id.

ALTER TABLE `tb_song`
    MODIFY COLUMN `cover_url` varchar(2048) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '歌曲封面 url',
    MODIFY COLUMN `audio_url` varchar(2048) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '歌曲 url',
    MODIFY COLUMN `duration` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '歌曲时长';
