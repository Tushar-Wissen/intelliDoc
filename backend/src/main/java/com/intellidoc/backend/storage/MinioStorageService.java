package com.intellidoc.backend.storage;

import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.StatObjectArgs;
import io.minio.StatObjectResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.InputStream;

@Service
@Slf4j
public class MinioStorageService {

    private final MinioClient minioClient;
    private final String bucket;

    public MinioStorageService(
            MinioClient minioClient,
            @Value("${intellidoc.minio.bucket:intellidoc}") String bucket) {
        this.minioClient = minioClient;
        this.bucket = bucket;
    }

    public void store(String objectPath, byte[] bytes, String contentType) {
        try {
            ensureBucket();
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(objectPath)
                    .stream(new ByteArrayInputStream(bytes), bytes.length, -1)
                    .contentType(contentType == null || contentType.isBlank()
                            ? "application/octet-stream"
                            : contentType)
                    .build());
        } catch (Exception ex) {
            log.error("MinIO write failed for {}", objectPath, ex);
            throw new StorageWriteException(objectPath, ex);
        }
    }

    public StoredObject load(String objectPath) {
        try {
            StatObjectResponse stat = minioClient.statObject(StatObjectArgs.builder()
                    .bucket(bucket)
                    .object(objectPath)
                    .build());
            try (InputStream in = minioClient.getObject(GetObjectArgs.builder()
                    .bucket(bucket)
                    .object(objectPath)
                    .build())) {
                return new StoredObject(in.readAllBytes(), stat.contentType());
            }
        } catch (Exception ex) {
            log.error("MinIO read failed for {}", objectPath, ex);
            throw new StorageReadException(objectPath, ex);
        }
    }

    public String bucket() {
        return bucket;
    }

    private void ensureBucket() throws Exception {
        boolean exists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucket).build());
        if (!exists) {
            minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
        }
    }

    public record StoredObject(byte[] bytes, String contentType) {
    }

    public static class StorageWriteException extends RuntimeException {
        public StorageWriteException(String path, Throwable cause) {
            super("Failed to write " + path, cause);
        }
    }

    public static class StorageReadException extends RuntimeException {
        public StorageReadException(String path, Throwable cause) {
            super("Failed to read " + path, cause);
        }
    }
}
