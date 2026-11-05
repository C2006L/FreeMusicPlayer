CREATE TABLE IF NOT EXISTS fmp_collection (
 id char(36) PRIMARY KEY, user_id bigint NOT NULL, source varchar(20) NOT NULL,
 source_id varchar(128) NOT NULL, title varchar(160) NOT NULL,
 created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uk_collection_owner_source(user_id,source,source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS fmp_collection_song (
 collection_id char(36) NOT NULL, item_key char(64) NOT NULL, position int NOT NULL,
 metadata mediumtext NOT NULL, PRIMARY KEY(collection_id,item_key),
 KEY idx_collection_position(collection_id,position),
 FOREIGN KEY(collection_id) REFERENCES fmp_collection(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS fmp_import_job (
 id char(36) PRIMARY KEY, user_id bigint NOT NULL, collection_id char(36) NOT NULL,
 source varchar(20) NOT NULL, source_id varchar(128) NOT NULL, title varchar(160) NOT NULL,
 request_key varchar(64) NOT NULL, status varchar(24) NOT NULL DEFAULT 'QUEUED',
 total int NOT NULL DEFAULT 0, processed int NOT NULL DEFAULT 0, succeeded int NOT NULL DEFAULT 0,
 failed int NOT NULL DEFAULT 0, directory_loaded boolean NOT NULL DEFAULT false, cancel_requested boolean NOT NULL DEFAULT false,
 lease_owner varchar(36), error_text varchar(500),
 created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uk_job_request(user_id,request_key), KEY idx_job_dispatch(status,updated_at),
 KEY idx_job_user(user_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS fmp_import_item (
 job_id char(36) NOT NULL, item_key char(64) NOT NULL, position int NOT NULL,
 metadata mediumtext NOT NULL, status varchar(16) NOT NULL DEFAULT 'PENDING', error_text varchar(500),
 PRIMARY KEY(job_id,item_key), FOREIGN KEY(job_id) REFERENCES fmp_import_job(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS fmp_play_session (
 user_id bigint NOT NULL, session_id char(36) NOT NULL, song_key char(64) NOT NULL,
 title varchar(256) NOT NULL, artist varchar(256) NOT NULL, source varchar(24) NOT NULL,
 reported_seconds int NOT NULL DEFAULT 0, played_seconds int NOT NULL DEFAULT 0,
 position_seconds int NOT NULL DEFAULT 0,
 created_at datetime(3) NOT NULL, updated_at datetime(3) NOT NULL,
 PRIMARY KEY(user_id,session_id), KEY idx_play_user_time(user_id,created_at),
 KEY idx_play_user_song(user_id,song_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS fmp_audit (
 id bigint PRIMARY KEY AUTO_INCREMENT, user_id bigint, action varchar(64) NOT NULL,
 resource_id varchar(128), request_id varchar(64), created_at datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
 KEY idx_audit_time(created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
