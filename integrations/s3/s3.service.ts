import { createReadStream, createWriteStream, unlinkSync } from 'fs';
import { promisify } from 'util';
import { pipeline } from 'stream';
import {
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client } from './s3.client.js';
import { config } from '../../config/index.js';
import path from 'path';

const pipelineAsync = promisify(pipeline);

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export class S3Service {
  private bucket: string;

  constructor(bucket: string = config.s3.bucket) {
    this.bucket = bucket;
  }

  async uploadFile(localPath: string, s3Key: string): Promise<string> {
    const fileStream = createReadStream(localPath);
    const parallelUpload = new Upload({
      client: s3Client,
      params: {
        Bucket: this.bucket,
        Key: s3Key,
        Body: fileStream,
        requestChecksumCalculation: 'WHEN_REQUIRED',
      },
      queueSize: 4,
      partSize: 10 * 1024 * 1024,
      leavePartsOnError: false,
    });
    await parallelUpload.done();
    return s3Key;
  }

  async getSignedUrl(s3Key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });
    return getSignedUrl(s3Client, command, { expiresIn });
  }

  async getCachedSignedUrl(s3Key: string, expiresIn: number = 3600): Promise<string> {
    const now = Date.now();
    const cached = signedUrlCache.get(s3Key);
    if (cached && cached.expiresAt > now + 5 * 60 * 1000) {
      return cached.url;
    }
    const url = await this.getSignedUrl(s3Key, expiresIn);
    signedUrlCache.set(s3Key, { url, expiresAt: now + expiresIn * 1000 });
    return url;
  }

  async deleteFile(s3Key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
      });
      await s3Client.send(command);
    } catch (_) {
      // ignore
    }
  }

  async fileExists(s3Key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
      });
      await s3Client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  async downloadFile(s3Key: string, localPath: string): Promise<void> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });
    const response = await s3Client.send(command);
    const writeStream = createWriteStream(localPath);
    await pipelineAsync(response.Body as NodeJS.ReadableStream, writeStream);
  }

  async getJsonObject(s3Key: string): Promise<any> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
    });
    const response = await s3Client.send(command);
    const body = await new Promise<string>((resolve, reject) => {
      let chunks = '';
      response.Body!.on('data', (chunk: any) => (chunks += chunk.toString()));
      response.Body!.on('end', () => resolve(chunks));
      response.Body!.on('error', reject);
    });
    return JSON.parse(body);
  }
}