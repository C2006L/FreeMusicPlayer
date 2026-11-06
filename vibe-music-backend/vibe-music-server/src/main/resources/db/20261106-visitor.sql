CREATE TABLE IF NOT EXISTS fmp_visitor_event (
 id bigint PRIMARY KEY AUTO_INCREMENT, visitor_id char(36) NOT NULL,
 event varchar(16) NOT NULL, keyword varchar(128), source varchar(128), song_key varchar(128),
 created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY idx_visitor_created(visitor_id,created_at),
 KEY idx_event_created(event,created_at),
 KEY idx_keyword_created(keyword,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
