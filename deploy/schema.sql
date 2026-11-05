-- Schema only; no upstream accounts, personal records, media or demonstration data.
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
CREATE TABLE `tb_admin`  (
  `id` bigint(0) NOT NULL AUTO_INCREMENT COMMENT '管理员 id',
  `username` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '管理员用户名',
  `password` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '管理员密码',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `username`(`username`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 170 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

CREATE TABLE `tb_artist`  (
  `id` bigint(0) NOT NULL AUTO_INCREMENT COMMENT '歌手 id',
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '歌手姓名',
  `gender` int(0) NULL DEFAULT NULL COMMENT '歌手性别：0-男，1-女，2-组合/乐队',
  `avatar` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '歌手头像',
  `birth` date NULL DEFAULT NULL COMMENT '歌手出生日期',
  `area` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '歌手国籍',
  `introduction` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '歌手简介',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `name`(`name`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 142 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

CREATE TABLE `tb_banner`  (
  `id` bigint(0) NOT NULL AUTO_INCREMENT COMMENT '轮播图 id',
  `banner_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '轮播图 url',
  `status` tinyint(0) NOT NULL COMMENT '轮播图状态：0-启用，1-禁用',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 31 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

CREATE TABLE `tb_comment`  (
  `id` bigint(0) NOT NULL AUTO_INCREMENT COMMENT '评论 id',
  `user_id` bigint(0) NOT NULL COMMENT '用户 id',
  `song_id` bigint(0) NULL DEFAULT NULL COMMENT '歌曲 id',
  `playlist_id` bigint(0) NULL DEFAULT NULL COMMENT '歌单 id',
  `content` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '评论内容',
  `create_time` datetime(0) NOT NULL COMMENT '评论时间',
  `type` tinyint(0) NOT NULL COMMENT '评论类型：0-歌曲评论，1-歌单评论',
  `like_count` bigint(0) NULL DEFAULT NULL COMMENT '点赞数量',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `fk_comment_song_id`(`song_id`) USING BTREE,
  INDEX `fk_comment_user_id`(`user_id`) USING BTREE,
  INDEX `fk_comment_playlist_id`(`playlist_id`) USING BTREE,
  CONSTRAINT `fk_comment_playlist_id` FOREIGN KEY (`playlist_id`) REFERENCES `tb_playlist` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_comment_song_id` FOREIGN KEY (`song_id`) REFERENCES `tb_song` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_comment_user_id` FOREIGN KEY (`user_id`) REFERENCES `tb_user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 194 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

CREATE TABLE `tb_feedback`  (
  `id` bigint(0) NOT NULL AUTO_INCREMENT COMMENT '反馈 id',
  `user_id` bigint(0) NOT NULL COMMENT '用户 id',
  `feedback` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '反馈内容',
  `create_time` datetime(0) NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `fk_feedback_user_id`(`user_id`) USING BTREE,
  CONSTRAINT `fk_feedback_user_id` FOREIGN KEY (`user_id`) REFERENCES `tb_user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 73 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

CREATE TABLE `tb_genre`  (
  `song_id` bigint(0) NOT NULL COMMENT '歌曲 id',
  `style_id` bigint(0) NOT NULL COMMENT '风格 id',
  PRIMARY KEY (`song_id`, `style_id`) USING BTREE,
  INDEX `fk_genre_style_id`(`style_id`) USING BTREE,
  CONSTRAINT `fk_genre_song_id` FOREIGN KEY (`song_id`) REFERENCES `tb_song` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_genre_style_id` FOREIGN KEY (`style_id`) REFERENCES `tb_style` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

CREATE TABLE `tb_playlist`  (
  `id` bigint(0) NOT NULL AUTO_INCREMENT COMMENT '歌单 id',
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '歌单标题',
  `cover_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '歌单封面',
  `introduction` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '歌单简介',
  `style` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '歌单风格',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 24 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

CREATE TABLE `tb_playlist_binding`  (
  `playlist_id` bigint(0) NOT NULL COMMENT '歌单 id',
  `song_id` bigint(0) NOT NULL COMMENT '歌曲 id',
  PRIMARY KEY (`playlist_id`, `song_id`) USING BTREE,
  INDEX `fk_playlist_binding_song_id`(`song_id`) USING BTREE,
  CONSTRAINT `fk_playlist_binding_playlist_id` FOREIGN KEY (`playlist_id`) REFERENCES `tb_playlist` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_playlist_binding_song_id` FOREIGN KEY (`song_id`) REFERENCES `tb_song` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

CREATE TABLE `tb_song`  (
  `id` bigint(0) NOT NULL AUTO_INCREMENT COMMENT '歌曲 id',
  `artist_id` bigint(0) NOT NULL COMMENT '歌手 id',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '歌名',
  `album` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '专辑',
  `lyric` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '歌词',
  `duration` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '歌曲时长',
  `style` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '歌曲风格',
  `cover_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '歌曲封面 url',
  `audio_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '歌曲 url',
  `release_time` date NOT NULL COMMENT '歌曲发行时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `fk_song_artist_id`(`artist_id`) USING BTREE,
  CONSTRAINT `fk_song_artist_id` FOREIGN KEY (`artist_id`) REFERENCES `tb_artist` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 535 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

CREATE TABLE `tb_style`  (
  `id` bigint(0) NOT NULL AUTO_INCREMENT COMMENT '风格 id',
  `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '风格名称',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `name`(`name`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 17 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

CREATE TABLE `tb_user`  (
  `id` bigint(0) NOT NULL AUTO_INCREMENT COMMENT '用户 id',
  `username` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '用户名',
  `password` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '用户密码',
  `phone` varchar(11) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '用户手机号',
  `email` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '用户邮箱',
  `user_avatar` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '用户头像',
  `introduction` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '用户简介',
  `create_time` datetime(0) NOT NULL COMMENT '用户创建时间',
  `update_time` datetime(0) NOT NULL COMMENT '用户修改时间',
  `status` tinyint(0) NOT NULL COMMENT '用户状态：0-启用，1-禁用',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `username`(`username`) USING BTREE,
  UNIQUE INDEX `email`(`email`) USING BTREE,
  UNIQUE INDEX `phone`(`phone`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 148 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;

CREATE TABLE `tb_user_favorite`  (
  `id` bigint(0) NOT NULL AUTO_INCREMENT COMMENT 'id',
  `user_id` bigint(0) NOT NULL COMMENT '用户 id',
  `type` tinyint(0) NOT NULL COMMENT '收藏类型：0-歌曲，1-歌单',
  `song_id` bigint(0) NULL DEFAULT NULL COMMENT '收藏歌曲 id',
  `playlist_id` bigint(0) NULL DEFAULT NULL COMMENT '收藏歌单 id',
  `create_time` datetime(0) NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `fk_user_favorite_user_id`(`user_id`) USING BTREE,
  INDEX `fk_user_favorite_song_id`(`song_id`) USING BTREE,
  INDEX `fk_user_favorite_playlist_id`(`playlist_id`) USING BTREE,
  CONSTRAINT `fk_user_favorite_playlist_id` FOREIGN KEY (`playlist_id`) REFERENCES `tb_playlist` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_user_favorite_song_id` FOREIGN KEY (`song_id`) REFERENCES `tb_song` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_user_favorite_user_id` FOREIGN KEY (`user_id`) REFERENCES `tb_user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB AUTO_INCREMENT = 432 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci ROW_FORMAT = Dynamic;
SET FOREIGN_KEY_CHECKS = 1;

