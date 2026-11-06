package com.vibemusic.service.impl;

import jakarta.mail.MessagingException;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeUtility;
import org.junit.jupiter.api.Test;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Properties;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 用真实的 SMTP 会话证明验证码确实投递到请求里填写的收件人，
 * 同时覆盖"本机 Mailpit 默认被拦截"的分支。
 */
class EmailDeliveryTest {

    @Test
    void deliversVerificationCodeToRequestedRecipient() throws Exception {
        try (SmtpSink sink = new SmtpSink()) {
            assertTrue(sink.awaitReady(), "本地 SMTP 测试端点未能启动");

            String recipient = "real.user@example.com";
            EmailServiceImpl service = newService(sink.port(), true);
            String code = service.sendVerificationCodeEmail(recipient);

            assertNotNull(code, "验证码邮件发送失败");
            assertTrue(sink.awaitMessage(), "本地 SMTP 端点没有收到邮件");

            MimeMessage message = sink.message();
            assertEquals(recipient, InternetAddress.toString(message.getAllRecipients()));
            assertEquals("【FreeMusicPlayer】验证码", MimeUtility.decodeText(message.getSubject()));
            String body = String.valueOf(message.getContent());
            assertTrue(body.contains(code), "邮件正文没有包含刚生成的验证码: " + body);
            assertTrue(body.contains("5 分钟内有效"), "邮件正文模板缺失: " + body);
        }
    }

    @Test
    void loopbackSmtpIsBlockedUnlessExplicitlyAllowed() {
        EmailServiceImpl blocked = newService(1025, false);
        assertFalse(blocked.deliversToExternalMailbox(), "未配置真实 SMTP 时不应被视为可外部投递");
        assertEquals("127.0.0.1:1025", blocked.deliveryTarget());

        EmailServiceImpl allowed = newService(1025, true);
        assertTrue(allowed.deliversToExternalMailbox(), "显式开启本地调试后应允许投递");

        EmailServiceImpl external = newService(465, false);
        ReflectionTestUtils.setField(external, "host", "smtp.163.com");
        assertTrue(external.deliversToExternalMailbox(), "真实 SMTP 主机应被视为外部投递");
        assertEquals("smtp.163.com:465", external.deliveryTarget());
    }

    private EmailServiceImpl newService(int port, boolean allowLocalSink) {
        JavaMailSenderImpl sender = new JavaMailSenderImpl();
        sender.setHost("127.0.0.1");
        sender.setPort(port);
        sender.setProtocol("smtp");
        Properties properties = sender.getJavaMailProperties();
        properties.put("mail.smtp.auth", "false");
        properties.put("mail.smtp.starttls.enable", "false");
        properties.put("mail.smtp.ssl.enable", "false");
        properties.put("mail.smtp.connectiontimeout", "5000");
        properties.put("mail.smtp.timeout", "5000");

        EmailServiceImpl service = new EmailServiceImpl();
        ReflectionTestUtils.setField(service, "mailSender", sender);
        ReflectionTestUtils.setField(service, "from", "noreply@vibemusic.test");
        ReflectionTestUtils.setField(service, "host", "127.0.0.1");
        ReflectionTestUtils.setField(service, "port", port);
        ReflectionTestUtils.setField(service, "allowLocalSink", allowLocalSink);
        return service;
    }

    /** 只实现发信所需的最小 SMTP 对话，并保留原始报文用于断言。 */
    private static final class SmtpSink implements AutoCloseable {

        private final ServerSocket serverSocket;
        private final ExecutorService executor = Executors.newSingleThreadExecutor();
        private final CountDownLatch ready = new CountDownLatch(1);
        private final CountDownLatch received = new CountDownLatch(1);
        private volatile byte[] raw;

        SmtpSink() throws IOException {
            serverSocket = new ServerSocket(0, 1, InetAddress.getLoopbackAddress());
            executor.submit(this::serve);
        }

        int port() {
            return serverSocket.getLocalPort();
        }

        boolean awaitReady() throws InterruptedException {
            return ready.await(5, TimeUnit.SECONDS);
        }

        boolean awaitMessage() throws InterruptedException {
            return received.await(10, TimeUnit.SECONDS);
        }

        MimeMessage message() throws MessagingException {
            return new MimeMessage(Session.getDefaultInstance(new Properties()), new ByteArrayInputStream(raw));
        }

        private void serve() {
            ready.countDown();
            try (Socket socket = serverSocket.accept()) {
                // ISO-8859-1 按字节透传，避免把 UTF-8 正文读坏
                BufferedReader reader = new BufferedReader(
                        new InputStreamReader(socket.getInputStream(), StandardCharsets.ISO_8859_1));
                OutputStream out = socket.getOutputStream();
                write(out, "220 localhost ESMTP\r\n");
                StringBuilder data = new StringBuilder();
                boolean inData = false;
                String line;
                while ((line = reader.readLine()) != null) {
                    if (inData) {
                        if (".".equals(line)) {
                            inData = false;
                            raw = data.toString().getBytes(StandardCharsets.ISO_8859_1);
                            write(out, "250 OK\r\n");
                            received.countDown();
                            continue;
                        }
                        // RFC 5321 的 dot-stuffing 还原
                        data.append(line.startsWith("..") ? line.substring(1) : line).append("\r\n");
                        continue;
                    }
                    String command = line.toUpperCase(Locale.ROOT);
                    if (command.startsWith("EHLO")) {
                        write(out, "250-localhost\r\n250 OK\r\n");
                    } else if (command.startsWith("HELO") || command.startsWith("MAIL FROM")
                            || command.startsWith("RCPT TO") || command.startsWith("RSET")
                            || command.startsWith("NOOP")) {
                        write(out, "250 OK\r\n");
                    } else if (command.startsWith("DATA")) {
                        inData = true;
                        write(out, "354 End data with <CR><LF>.<CR><LF>\r\n");
                    } else if (command.startsWith("QUIT")) {
                        write(out, "221 Bye\r\n");
                        break;
                    } else {
                        write(out, "250 OK\r\n");
                    }
                }
            } catch (IOException ignored) {
                // 测试结束或客户端断开
            }
        }

        private static void write(OutputStream out, String text) throws IOException {
            out.write(text.getBytes(StandardCharsets.US_ASCII));
            out.flush();
        }

        @Override
        public void close() throws IOException {
            executor.shutdownNow();
            serverSocket.close();
        }
    }
}
