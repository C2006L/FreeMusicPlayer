package com.vibemusic.service.impl;

import com.vibemusic.constant.MessageConstant;
import com.vibemusic.service.EmailService;
import com.vibemusic.util.RandomCodeUtil;
import jakarta.annotation.PostConstruct;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.io.UnsupportedEncodingException;
import java.util.Locale;
import java.util.Set;

/**
 * <p>
 * 服务实现类
 * </p>
 *
 * @author sunpingli
 * @since 2025-01-09
 */
@Slf4j
@Service
public class EmailServiceImpl implements EmailService {

    /**
     * 本机邮件接收器（Mailpit / MailHog / smtp4dev）的常见主机名。
     * 命中这些主机时邮件只会在本机被收下，外部邮箱永远收不到。
     */
    private static final Set<String> LOOPBACK_HOSTS = Set.of("localhost", "127.0.0.1", "::1", "0.0.0.0", "[::1]");

    @Autowired
    private JavaMailSenderImpl mailSender;

    @Value("${spring.mail.username}")
    private String from;

    @Value("${spring.mail.host:localhost}")
    private String host;

    @Value("${spring.mail.port:25}")
    private int port;

    /**
     * 本地调试开关：允许把验证码投递到本机 Mailpit。
     * 默认关闭，避免“接口提示发送成功、用户邮箱却收不到”。
     */
    @Value("${vibe-music.mail.allow-local-sink:false}")
    private boolean allowLocalSink;

    @PostConstruct
    void logDeliveryTarget() {
        if (isLoopbackHost() && !allowLocalSink) {
            log.warn("邮件服务指向本机接收器 {}，验证码不会投递到外部邮箱；"
                    + "如需真实收件请配置 SMTP_HOST/SMTP_PORT/SMTP_USERNAME/SMTP_PASSWORD，"
                    + "仅本地调试可设置 FMP_MAIL_ALLOW_LOCAL=true", deliveryTarget());
        } else {
            log.info("邮件服务目标 {}（{}）", deliveryTarget(), deliversToExternalMailbox() ? "外部投递" : "本机接收器");
        }
    }

    /**
     * 发送邮件
     *
     * @param to      收件人地址
     * @param subject 邮件主题
     * @param content 邮件内容
     * @return 发送结果，包含是否成功
     */
    @Override
    public boolean sendEmail(String to, String subject, String content) {
        MimeMessage mimeMessage = mailSender.createMimeMessage();
        try {
            MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, "UTF-8");
            // Fixed display name only; the address still comes from configuration.
            helper.setFrom(new InternetAddress(from, "FreeMusicPlayer", "UTF-8"));
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(content);
            mailSender.send(mimeMessage);
            return true;
        } catch (MessagingException | MailException | UnsupportedEncodingException e) {
            log.error("向 {} 发送邮件失败（SMTP {}）：{}", to, deliveryTarget(), e.getMessage(), e);
            return false;
        }
    }

    /**
     * 发送验证码邮件
     *
     * @param email 收件人地址
     * @return 发送成功返回验证码，失败返回 null
     */
    @Override
    public String sendVerificationCodeEmail(String email) {
        String verificationCode = RandomCodeUtil.generateRandomCode();
        String subject = "【FreeMusicPlayer】验证码";
        String content = "您正在验证 FreeMusicPlayer 账号，验证码为：" + verificationCode
                + "。验证码 5 分钟内有效，请勿转发给他人。";
        boolean success = sendEmail(email, subject, content);
        if (success) {
            return verificationCode;
        } else {
            return null;
        }
    }

    @Override
    public String deliveryTarget() {
        return host + ":" + port;
    }

    @Override
    public boolean deliversToExternalMailbox() {
        return !isLoopbackHost() || allowLocalSink;
    }

    private boolean isLoopbackHost() {
        return host != null && LOOPBACK_HOSTS.contains(host.trim().toLowerCase(Locale.ROOT));
    }
}
