package com.vibemusic.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;
import com.vibemusic.service.AiStatusService;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import java.net.http.HttpClient;
import java.time.Duration;

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
    private final AiStatusService aiStatus;
    @Value("${spring.mail.host:localhost}")
    private String mailHost;
    @Value("${spring.mail.port:1025}")
    private int mailPort;

    public HealthController(
            JdbcTemplate jdbcTemplate,
            StringRedisTemplate redisTemplate,
            RestClient.Builder restClientBuilder,
            @Value("${vibe-music.online.provider-url:http://127.0.0.1:3001}") String providerUrl,
            @Value("${vibe-music.minio.enabled:false}") boolean minioEnabled,
            @Value("${vibe-music.minio.endpoint:http://127.0.0.1:9000}") String minioEndpoint,
            AiStatusService aiStatus) {
        this.jdbcTemplate = jdbcTemplate;
        this.redisTemplate = redisTemplate;
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build());
        factory.setReadTimeout(Duration.ofSeconds(3));
        this.restClient = restClientBuilder.requestFactory(factory).build();
        this.providerUrl = trim(providerUrl);
        this.minioEnabled = minioEnabled;
        this.minioEndpoint = trim(minioEndpoint);
        this.aiStatus = aiStatus;
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
        Map<String, Object> online = new LinkedHashMap<>(state(provider, true));
        if (provider) {
            try {
                Map payload = restClient.get().uri(providerUrl + "/health").retrieve().body(Map.class);
                if (payload != null) online.put("sources", payload.getOrDefault("recentSourceStatus", Map.of()));
            } catch (Exception ignored) { }
        }
        components.put("onlineProvider", online);
        components.put("minio", minioEnabled ? state(minio, false) : Map.of("status", "DISABLED", "required", false));
        components.put("ai", aiStatus.status());
        boolean localMail = "localhost".equals(mailHost) || "127.0.0.1".equals(mailHost);
        boolean mail = false;
        try (java.net.Socket socket = new java.net.Socket()) {
            socket.connect(new java.net.InetSocketAddress(mailHost, mailPort), 1500);
            mail = true;
        } catch (Exception ignored) { }
        components.put("mail", Map.of("status", mail ? "REACHABLE" : "DOWN", "required", false,
                "message", mail ? localMail ? "本地测试收件箱已连接，不会投递外部邮件" : "SMTP 端口可达，实际发信仍需验证账号" : "发信服务不可达；本机可用 -WithMail 启动测试收件箱"));

        return Map.of(
                "application", "FreeMusicPlayer",
                "apiVersion", 2,
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
