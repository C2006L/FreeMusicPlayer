package com.vibemusic.analytics;

import com.vibemusic.util.ThreadLocalUtil;
import jakarta.annotation.PreDestroy;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Records trial activity from visitors without a login session. Logged-in usage
 * stays in fmp_play_session / fmp_audit; this table only answers "did anonymous
 * visitors search, stream or probe anything".
 */
@Service
public class AnonymousTrafficService {
    private static final int RETENTION_DAYS = 7;
    private final JdbcTemplate db;
    private final ExecutorService writer = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "anon-traffic-writer");
        thread.setDaemon(true);
        return thread;
    });
    // 搜索会按来源并发触发多次、播放会因 Range 重发多次，短窗口内合并为一条。
    private final ConcurrentHashMap<String, Long> recent = new ConcurrentHashMap<>();

    public AnonymousTrafficService(JdbcTemplate db) {
        this.db = db;
    }

    /** Public endpoints parse a token when present, so a null context means no login. */
    public static boolean isAnonymous() {
        return ThreadLocalUtil.get() == null;
    }

    public void recordSearch(String visitorId, String keyword) {
        // 搜索会按来源并发触发多次，短窗口内只保留一条；来源在“播放/探测来源分布”中单独统计。
        if (isDuplicate(visitorId, "search", keyword, 5000)) return;
        insert(visitorId, "search", keyword, "search", null);
    }

    public void recordStream(String visitorId, String source, String songId) {
        String key = songKey(source, songId);
        if (isDuplicate(visitorId, "stream", key, 30000)) return;
        insert(visitorId, "stream", null, source, key);
    }

    public void recordProbe(String visitorId, String source, String songId) {
        String key = songKey(source, songId);
        if (isDuplicate(visitorId, "probe", key, 30000)) return;
        insert(visitorId, "probe", null, source, key);
    }

    private boolean isDuplicate(String visitorId, String event, String subject, long windowMs) {
        String normalized = normalize(visitorId);
        if (normalized == null) return true;
        long now = System.currentTimeMillis();
        String key = normalized + "|" + event + "|" + (subject == null ? "" : subject);
        boolean[] duplicate = { false };
        recent.compute(key, (ignored, previous) -> {
            if (previous != null && now - previous < windowMs) {
                duplicate[0] = true;
                return previous;
            }
            return now;
        });
        if (recent.size() > 2000) {
            recent.entrySet().removeIf(entry -> now - entry.getValue() > 60000);
        }
        return duplicate[0];
    }

    private void insert(String visitorId, String event, String keyword, String source, String songKey) {
        String visitor = normalize(visitorId);
        if (visitor == null) return;
        String trimmedKeyword = keyword == null || keyword.isBlank() ? null : trim(keyword.trim(), 100);
        String trimmedSource = trim(source, 128);
        String trimmedSong = trim(songKey, 128);
        writer.submit(() -> {
            try {
                db.update("INSERT INTO fmp_visitor_event(visitor_id,event,keyword,source,song_key) VALUES (?,?,?,?,?)",
                        visitor, event, trimmedKeyword, trimmedSource, trimmedSong);
            } catch (Exception ignored) {
                // Statistics must never break playback or search.
            }
        });
    }

    private static String normalize(String visitorId) {
        if (visitorId == null) return null;
        String value = visitorId.trim();
        return value.matches("[a-zA-Z0-9-]{8,64}") ? value : null;
    }

    private static String songKey(String source, String songId) {
        if (source == null || songId == null) return source;
        return source + ":" + songId;
    }

    private static String trim(String value, int max) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }

    /** Keeps only a week of anonymous events; the admin page reports the same window. */
    @Scheduled(cron = "0 0 4 * * *")
    public void purgeExpired() {
        try {
            db.update("DELETE FROM fmp_visitor_event WHERE created_at < NOW(3) - INTERVAL " + RETENTION_DAYS + " DAY");
        } catch (Exception ignored) {
            // Purge retries on the next schedule.
        }
    }

    @PreDestroy
    public void shutdown() {
        writer.shutdown();
    }
}
