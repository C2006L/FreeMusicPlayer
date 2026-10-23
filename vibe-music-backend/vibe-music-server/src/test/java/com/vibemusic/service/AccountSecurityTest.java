package com.vibemusic.service;

import com.vibemusic.mapper.UserMapper;
import com.vibemusic.model.dto.UserDTO;
import com.vibemusic.model.entity.User;
import com.vibemusic.service.impl.UserServiceImpl;
import com.vibemusic.util.JwtUtil;
import com.vibemusic.util.ThreadLocalUtil;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AccountSecurityTest {
    @AfterEach
    void cleanup() { ThreadLocalUtil.remove(); }

    @Test
    void profileCannotTargetAnotherUser() {
        UserMapper mapper = mock(UserMapper.class);
        when(mapper.selectById(7L)).thenReturn(new User().setUserId(7L).setEmail("me@example.com"));
        when(mapper.updateById(any(User.class))).thenReturn(1);
        UserServiceImpl service = new UserServiceImpl();
        ReflectionTestUtils.setField(service, "userMapper", mapper);
        ThreadLocalUtil.set(Map.of("userId", 7L));
        UserDTO dto = new UserDTO();
        dto.setUserId(99L); dto.setUsername("currentuser"); dto.setEmail("me@example.com");

        assertEquals(0, service.updateUserInfo(dto).getCode());
        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(mapper).updateById(saved.capture());
        assertEquals(7L, saved.getValue().getUserId());
    }

    @Test
    void changingEmailRequiresVerification() {
        UserMapper mapper = mock(UserMapper.class);
        when(mapper.selectById(7L)).thenReturn(new User().setUserId(7L).setEmail("me@example.com"));
        UserServiceImpl service = new UserServiceImpl();
        ReflectionTestUtils.setField(service, "userMapper", mapper);
        ThreadLocalUtil.set(Map.of("userId", 7L));
        UserDTO dto = new UserDTO();
        dto.setUsername("currentuser"); dto.setEmail("other@example.com");

        assertEquals(1, service.updateUserInfo(dto).getCode());
        verify(mapper, never()).updateById(any(User.class));
    }

    @Test
    void resetRevokesPreviouslyIssuedTokens() {
        JwtUtil.configure("test-secret-at-least-thirty-two-characters-long", 60_000);
        String token = JwtUtil.generateToken(Map.of("userId", 7, "sessionVersion", 0));
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ValueOperations<String, String> values = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        when(redis.hasKey(token)).thenReturn(true);
        when(values.get("session:version:7")).thenReturn("1");

        SessionService sessions = new SessionService(redis);
        assertThrows(IllegalArgumentException.class, () -> sessions.validate("Bearer " + token));
    }
}
