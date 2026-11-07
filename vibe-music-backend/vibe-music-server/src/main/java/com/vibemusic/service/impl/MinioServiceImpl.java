package com.vibemusic.service.impl;

import com.vibemusic.constant.MessageConstant;
import com.vibemusic.service.MinioService;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

@Service
@Slf4j
public class MinioServiceImpl implements MinioService {

    private final MinioClient minioClient;

    @Value("${minio.bucket}")
    private String bucketName;

    @Value("${minio.endpoint}")
    private String endpoint;

    /** MinIO 不可用时的本地回退目录，保证头像等上传功能在无对象存储环境下仍可用。 */
    @Value("${vibe-music.upload.dir:./.runtime/uploads}")
    private String localDir;

    @Value("${vibe-music.upload.public-base-url:http://localhost:18080}")
    private String publicBaseUrl;

    public MinioServiceImpl(MinioClient minioClient) {
        this.minioClient = minioClient;
    }

    /**
     * 上传文件到 Minio
     *
     * @param file   文件
     * @param folder 文件夹
     * @return 可访问的 URL
     */
    @Override
    public String uploadFile(MultipartFile file, String folder) {
        String safeName = sanitize(file.getOriginalFilename());
        String fileName = folder + "/" + UUID.randomUUID() + "-" + safeName;
        log.info("上传文件: {}", fileName);
        try {
            // 获取文件流
            InputStream inputStream = file.getInputStream();

            // 上传文件
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucketName)
                            .object(fileName)
                            .stream(inputStream, file.getSize(), -1)
                            .contentType(file.getContentType())
                            .build()
            );

            // 返回可访问的 URL

            return endpoint + "/" + bucketName + "/" + fileName;

        } catch (Exception e) {
            // 未启用/未启动 MinIO 时回退到本地磁盘，由 /uploads/** 静态映射对外提供。
            log.warn("MinIO 上传失败，回退本地磁盘存储: {}", e.getMessage());
            return storeLocally(file, fileName);
        }
    }

    private String storeLocally(MultipartFile file, String fileName) {
        try {
            Path target = Paths.get(localDir).toAbsolutePath().normalize().resolve(fileName);
            Files.createDirectories(target.getParent());
            try (InputStream inputStream = file.getInputStream()) {
                Files.copy(inputStream, target, StandardCopyOption.REPLACE_EXISTING);
            }
            log.info("已写入本地文件: {}", target);
            return publicBaseUrl.replaceAll("/+$", "") + "/uploads/" + fileName;
        } catch (Exception e) {
            throw new RuntimeException(MessageConstant.FILE_UPLOAD + MessageConstant.FAILED + "：" + e.getMessage());
        }
    }

    private String sanitize(String originalName) {
        String name = originalName == null ? "file" : originalName.replaceAll("[\\\\/:*?\"<>|]", "_");
        return name.isBlank() ? "file" : name;
    }

    /**
     * 删除文件
     *
     * @param fileUrl 文件 URL
     */
    @Override
    public void deleteFile(String fileUrl) {
        String url = fileUrl == null ? "" : fileUrl;
        int marker = url.indexOf("/uploads/");
        if (marker >= 0) {
            try {
                Path target = Paths.get(localDir).toAbsolutePath().normalize()
                        .resolve(url.substring(marker + "/uploads/".length()));
                Files.deleteIfExists(target);
                log.info("已删除本地文件: {}", target);
            } catch (Exception e) {
                log.warn("删除本地文件失败: {}", e.getMessage());
            }
            return;
        }
        try {
            // 解析 URL，获取文件路径
            String filePath = url.replace(endpoint + "/" + bucketName + "/", "");
            log.info("删除文件: {}", filePath);
            // 删除文件
            minioClient.removeObject(
                    RemoveObjectArgs.builder()
                            .bucket(bucketName)
                            .object(filePath)
                            .build()
            );

        } catch (Exception e) {
            // 旧文件清理失败不应阻断头像/封面替换等主流程。
            log.warn("删除 MinIO 文件失败: {}", e.getMessage());
        }
    }
}
