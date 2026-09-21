package com.intellidoc.backend.storage;

import io.minio.MinioClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MinioConfig {

    @Bean
    public MinioClient minioClient(
            @Value("${intellidoc.minio.endpoint:http://localhost:9000}") String endpoint,
            @Value("${intellidoc.minio.access-key:minioadmin}") String accessKey,
            @Value("${intellidoc.minio.secret-key:minioadmin}") String secretKey) {
        return MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey)
                .build();
    }
}
