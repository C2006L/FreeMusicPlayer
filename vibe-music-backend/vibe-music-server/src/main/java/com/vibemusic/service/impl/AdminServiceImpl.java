package com.vibemusic.service.impl;

import com.vibemusic.constant.JwtClaimsConstant;
import com.vibemusic.constant.MessageConstant;
import com.vibemusic.enumeration.RoleEnum;
import com.vibemusic.mapper.AdminMapper;
import com.vibemusic.model.dto.AdminDTO;
import com.vibemusic.model.entity.Admin;
import com.vibemusic.result.Result;
import com.vibemusic.service.IAdminService;
import com.vibemusic.util.JwtUtil;
import com.vibemusic.util.PasswordUtil;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * <p>
 * 服务实现类
 * </p>
 *
 * @author sunpingli
 * @since 2025-01-09
 */
@Service
public class AdminServiceImpl extends ServiceImpl<AdminMapper, Admin> implements IAdminService {

    private static final int MAX_LOGIN_FAILURES = 5;

    @Autowired
    private AdminMapper adminMapper;
    @Autowired
    private StringRedisTemplate stringRedisTemplate;

    /**
     * 管理员注册
     *
     * @param adminDTO 管理员信息
     * @return 结果
     */
    @Override
    public Result register(AdminDTO adminDTO) {
        Admin admin = adminMapper.selectOne(new QueryWrapper<Admin>().eq("username", adminDTO.getUsername()));
        if (admin != null) {
            return Result.error(MessageConstant.USERNAME + MessageConstant.ALREADY_EXISTS);
        }

        Admin adminRegister = new Admin();
        adminRegister.setUsername(adminDTO.getUsername()).setPassword(PasswordUtil.encode(adminDTO.getPassword()));

        if (adminMapper.insert(adminRegister) == 0) {
            return Result.error(MessageConstant.REGISTER + MessageConstant.FAILED);
        }
        return Result.success(MessageConstant.REGISTER + MessageConstant.SUCCESS);
    }

    /**
     * 管理员登录
     *
     * @param adminDTO 管理员信息
     * @return 结果
     */
    @Override
    public Result login(AdminDTO adminDTO) {
        String failureKey = "rate:admin:login:failed:" + adminDTO.getUsername().toLowerCase(Locale.ROOT);
        String failureCount = stringRedisTemplate.opsForValue().get(failureKey);
        if (failureCount != null && Integer.parseInt(failureCount) >= MAX_LOGIN_FAILURES) {
            return Result.error(MessageConstant.LOGIN_TOO_FREQUENT);
        }

        Admin admin = adminMapper.selectOne(new QueryWrapper<Admin>().eq("username", adminDTO.getUsername()));
        if (admin == null) {
            recordLoginFailure(failureKey);
            return Result.error(MessageConstant.USERNAME + MessageConstant.ERROR);
        }

        if (PasswordUtil.matches(adminDTO.getPassword(), admin.getPassword())) {
            stringRedisTemplate.delete(failureKey);
            if (PasswordUtil.isLegacyMd5(admin.getPassword())) {
                adminMapper.update(new Admin().setPassword(PasswordUtil.encode(adminDTO.getPassword())),
                        new QueryWrapper<Admin>().eq("id", admin.getAdminId()));
            }
            // 登录成功
            Map<String, Object> claims = new HashMap<>();
            claims.put(JwtClaimsConstant.ROLE, RoleEnum.ADMIN.getRole());
            claims.put(JwtClaimsConstant.ADMIN_ID, admin.getAdminId());
            claims.put(JwtClaimsConstant.USERNAME, admin.getUsername());
            String token = JwtUtil.generateToken(claims);

            // 将token存入redis
            stringRedisTemplate.opsForValue().set(token, token, 6, TimeUnit.HOURS);

            return Result.success(MessageConstant.LOGIN + MessageConstant.SUCCESS, token);
        }

        recordLoginFailure(failureKey);
        return Result.error(MessageConstant.PASSWORD + MessageConstant.ERROR);
    }

    private void recordLoginFailure(String failureKey) {
        Long failures = stringRedisTemplate.opsForValue().increment(failureKey);
        if (failures != null && failures == 1) {
            stringRedisTemplate.expire(failureKey, 15, TimeUnit.MINUTES);
        }
    }

    /**
     * 登出
     *
     * @param token 认证token
     * @return 结果
     */
    @Override
    public Result logout(String token) {
        if (token != null && token.startsWith("Bearer ")) {
            token = token.substring(7);
        }
        // 注销token
        Boolean result = stringRedisTemplate.delete(token);
        if (result != null && result) {
            return Result.success(MessageConstant.LOGOUT + MessageConstant.SUCCESS);
        } else {
            return Result.error(MessageConstant.LOGOUT + MessageConstant.FAILED);
        }
    }
}
