import { S3Client as AWSS3Client, S3ClientConfig } from '@aws-sdk/client-s3';
import { config } from '../../config/index.js';

export const s3Client = new AWSS3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
  forcePathStyle: true,
} as S3ClientConfig);