package com.vibemusic.interceptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vibemusic.result.Result;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

@Component
public class AuthRateLimitInterceptor implements HandlerInterceptor {

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    public AuthRateLimitInterceptor(StringRedisTemplate redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws IOException {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        String path = request.getRequestURI();
        int limit;
        long windowMinutes;
        if ("/user/sendVerificationCode".equals(path)) {
            limit = 10;
            windowMinutes = 60;
        } else if ("/agent/chat".equals(path)) {
            limit = 20;
            windowMinutes = 15;
        } else {
            limit = 30;
            windowMinutes = 15;
        }

        String key = "rate:auth:ip:" + path + ":" + request.getRemoteAddr();
        Long count = redisTemplate.opsForValue().increment(key);
        if (count != null && count == 1) {
            redisTemplate.expire(key, windowMinutes, TimeUnit.MINUTES);
        }
        if (count != null && count > limit) {
            response.setStatus(429);
            response.setCharacterEncoding("UTF-8");
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write(objectMapper.writeValueAsString(Result.error("请求过于频繁，请稍后再试")));
            return false;
        }
        return true;
    }
}
