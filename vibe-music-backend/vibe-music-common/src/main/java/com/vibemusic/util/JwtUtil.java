package com.vibemusic.util;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;

import java.util.Date;
import java.util.Map;

/**
 * JWT 工具类
 */
public class JwtUtil {

    private static volatile String secretKey;
    private static volatile long expirationTime = 1000 * 60 * 60 * 6;

    private JwtUtil() {
    }

    public static void configure(String secret, long expirationMillis) {
        if (secret == null || secret.length() < 32) {
            throw new IllegalArgumentException("JWT secret must contain at least 32 characters");
        }
        secretKey = secret;
        expirationTime = expirationMillis;
    }

    private static Algorithm algorithm() {
        if (secretKey == null) {
            throw new IllegalStateException("JWT is not configured");
        }
        return Algorithm.HMAC256(secretKey);
    }

    /**
     * 生成 JWT token
     *
     * @param claims 自定义的业务数据
     * @return JWT token
     */
    public static String generateToken(Map<String, Object> claims) {
        return JWT.create()
                .withClaim("claims", claims) // 自定义的业务数据
                .withExpiresAt(new Date(System.currentTimeMillis() + expirationTime)) // 设置过期时间
                .sign(algorithm()); // 使用 HMAC256 算法签名
    }

    /**
     * 解析 JWT token
     *
     * @param token JWT token
     * @return 自定义的业务数据
     */
    public static Map<String, Object> parseToken(String token) {
        if (token != null && token.startsWith("Bearer ")) {
            token = token.substring(7);
        }
        return JWT.require(algorithm())
                .build()
                .verify(token)
                .getClaim("claims")
                .asMap();
    }

}
