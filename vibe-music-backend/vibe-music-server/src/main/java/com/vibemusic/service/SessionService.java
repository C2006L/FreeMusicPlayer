package com.vibemusic.service;

import com.vibemusic.util.JwtUtil;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class SessionService {
    private final StringRedisTemplate redis;
    public SessionService(StringRedisTemplate redis) { this.redis = redis; }

    public long version(Long userId) {
        String value = redis.opsForValue().get("session:version:" + userId);
        return value == null ? 0 : Long.parseLong(value);
    }

    public void revokeUser(Long userId) { redis.opsForValue().increment("session:version:" + userId); }

    public Map<String, Object> validate(String header) {
        String token = stripBearer(header);
        if (token == null || !Boolean.TRUE.equals(redis.hasKey(token))) throw new IllegalArgumentException("Session expired");
        Map<String, Object> claims = JwtUtil.parseToken(token);
        if (claims.get("userId") != null) {
            long expected = version(Long.valueOf(claims.get("userId").toString()));
            long actual = ((Number) claims.getOrDefault("sessionVersion", 0)).longValue();
            if (expected != actual) throw new IllegalArgumentException("Session revoked");
        }
        return claims;
    }

    public Map<String, Object> optional(String header) {
        try { return validate(header); } catch (RuntimeException exception) { return null; }
    }

    public static String stripBearer(String token) {
        return token != null && token.startsWith("Bearer ") ? token.substring(7) : token;
    }
}
