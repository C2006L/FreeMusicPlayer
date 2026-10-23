package com.vibemusic.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/** Incremental, restart-safe upgrades for existing databases as well as fresh Docker installs. */
@Component
public class SchemaMigrationRunner implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    public SchemaMigrationRunner(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Override
    public void run(ApplicationArguments args) {
        // All local instances share the same DB; serialize DDL across instances.
        jdbc.execute((java.sql.Connection connection) -> {
            JdbcTemplate db = new JdbcTemplate(new org.springframework.jdbc.datasource.SingleConnectionDataSource(connection, true));
            if (!Integer.valueOf(1).equals(db.queryForObject("SELECT GET_LOCK('fmp-schema', 30)", Integer.class))) {
                throw new IllegalStateException("Database migration is locked by another instance");
            }
            try { migrate(db); }
            finally { db.execute("DO RELEASE_LOCK('fmp-schema')"); }
            return null;
        });
    }

    private void migrate(JdbcTemplate db) {
        db.execute("CREATE TABLE IF NOT EXISTS fmp_schema_history (version varchar(32) PRIMARY KEY, applied_at timestamp DEFAULT CURRENT_TIMESTAMP)");
        var columns = List.of(
                new String[]{"source", "varchar(20) NOT NULL DEFAULT 'local'"},
                new String[]{"source_song_id", "varchar(100) NULL"},
                new String[]{"source_url_id", "varchar(100) NULL"},
                new String[]{"source_pic_id", "varchar(1000) NULL"},
                new String[]{"source_extra", "text NULL"},
                new String[]{"provider_engine", "varchar(30) NULL"},
                new String[]{"media_status", "varchar(20) NOT NULL DEFAULT 'active'"});
        for (String[] column : columns) {
            Integer count = db.queryForObject("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='tb_song' AND column_name=?", Integer.class, column[0]);
            if (count != null && count == 0) db.execute("ALTER TABLE tb_song ADD COLUMN `" + column[0] + "` " + column[1]);
        }
        if (db.queryForObject("SELECT COUNT(*) FROM fmp_schema_history WHERE version='20261024-online'", Integer.class) == 0) {
            db.execute("ALTER TABLE tb_song MODIFY COLUMN source_pic_id varchar(1000) NULL, MODIFY COLUMN release_time date NULL");
            for (String[] index : List.of(new String[]{"uk_song_source_id", "UNIQUE KEY uk_song_source_id (source, source_song_id)"},
                    new String[]{"idx_song_media_status", "INDEX idx_song_media_status (media_status)"})) {
                if (db.queryForObject("SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='tb_song' AND index_name=?", Integer.class, index[0]) == 0) {
                    db.execute("ALTER TABLE tb_song ADD " + index[1]);
                }
            }
            db.execute("UPDATE tb_song SET source='legacy-local',media_status='disabled' WHERE source='local' AND (audio_url LIKE 'http://localhost:9000/%' OR cover_url LIKE 'http://localhost:9000/%')");
            db.update("INSERT INTO fmp_schema_history(version) VALUES ('20261024-online')");
        }
    }
}
