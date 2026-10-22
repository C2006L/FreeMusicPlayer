package com.vibemusic.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class HealthController {

    private final JdbcTemplate jdbcTemplate;
    private final StringRedisTemplate redisTemplate;
    private final RestClient restClient;
    private final String providerUrl;
    private final boolean minioEnabled;
    private final String minioEndpoint;
    private final boolean aiConfigured;

    public HealthController(
            JdbcTemplate jdbcTemplate,
            StringRedisTemplate redisTemplate,
            RestClient.Builder restClientBuilder,
            @Value("${vibe-music.online.provider-url:http://127.0.0.1:3001}") String providerUrl,
            @Value("${vibe-music.minio.enabled:false}") boolean minioEnabled,
            @Value("${vibe-music.minio.endpoint:http://127.0.0.1:9000}") String minioEndpoint,
            @Value("${vibe-music.ai.dashscope.api-key:not-configured}") String apiKey) {
        this.jdbcTemplate = jdbcTemplate;
        this.redisTemplate = redisTemplate;
        this.restClient = restClientBuilder.build();
        this.providerUrl = trim(providerUrl);
        this.minioEnabled = minioEnabled;
        this.minioEndpoint = trim(minioEndpoint);
        this.aiConfigured = apiKey != null && !apiKey.isBlank() && !"not-configured".equals(apiKey);
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> components = new LinkedHashMap<>();
        boolean mysql = checkMysql();
        boolean redis = checkRedis();
        boolean provider = checkHttp(providerUrl + "/health");
        boolean minio = !minioEnabled || checkHttp(minioEndpoint + "/minio/health/live");

        components.put("mysql", state(mysql, true));
        components.put("redis", state(redis, true));
        components.put("onlineProvider", state(provider, true));
        components.put("minio", minioEnabled ? state(minio, false) : Map.of("status", "DISABLED", "required", false));
        components.put("ai", Map.of(
                "status", aiConfigured ? "CONFIGURED" : "NOT_CONFIGURED",
                "required", false
        ));

        return Map.of(
                "status", mysql && redis && provider && minio ? "UP" : "DEGRADED",
                "components", components
        );
    }

    private boolean checkMysql() {
        try {
            return Integer.valueOf(1).equals(jdbcTemplate.queryForObject("SELECT 1", Integer.class));
        } catch (Exception exception) {
            return false;
        }
    }

    private boolean checkRedis() {
        try (RedisConnection connection = redisTemplate.getConnectionFactory().getConnection()) {
            return "PONG".equalsIgnoreCase(connection.ping());
        } catch (Exception exception) {
            return false;
        }
    }

    private boolean checkHttp(String url) {
        try {
            restClient.get().uri(url).retrieve().toBodilessEntity();
            return true;
        } catch (Exception exception) {
            return false;
        }
    }

    private Map<String, Object> state(boolean available, boolean required) {
        return Map.of("status", available ? "UP" : "DOWN", "required", required);
    }

    private static String trim(String value) {
        return value != null && value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
