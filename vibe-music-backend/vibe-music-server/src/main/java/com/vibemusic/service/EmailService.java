package com.vibemusic.service;

/**
 * <p>
 * 服务类
 * </p>
 *
 * @author sunpingli
 * @since 2025-01-09
 */
public interface EmailService {

    // 发送邮件
    boolean sendEmail(String to, String subject, String content);

    // 发送验证码邮件
    String sendVerificationCodeEmail(String email);

    // 当前 SMTP 目标，形如 host:port，用于向用户说明投递去向
    String deliveryTarget();

    // 邮件是否会投递到外部真实邮箱；本机 Mailpit 等回环接收器返回 false
    boolean deliversToExternalMailbox();
}
