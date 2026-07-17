import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2BucketName, getR2Client } from "../config/r2.js";

const UPLOAD_URL_SECONDS = 15 * 60;
const PLAY_URL_SECONDS = 60 * 60;

export async function createVoiceUploadUrl({ storageKey, mimeType }) {
  const command = new PutObjectCommand({
    Bucket: getR2BucketName(),
    Key: storageKey,
    ContentType: mimeType
  });

  const url = await getSignedUrl(getR2Client(), command, {
    expiresIn: UPLOAD_URL_SECONDS
  });

  return {
    url,
    method: "PUT",
    expiresIn: UPLOAD_URL_SECONDS,
    headers: { "Content-Type": mimeType }
  };
}

export async function getVoiceObjectMetadata(storageKey) {
  return getR2Client().send(
    new HeadObjectCommand({
      Bucket: getR2BucketName(),
      Key: storageKey
    })
  );
}

export async function createVoicePlayUrl(storageKey) {
  const command = new GetObjectCommand({
    Bucket: getR2BucketName(),
    Key: storageKey
  });

  return getSignedUrl(getR2Client(), command, {
    expiresIn: PLAY_URL_SECONDS
  });
}

export async function deleteVoiceObject(storageKey) {
  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: getR2BucketName(),
      Key: storageKey
    })
  );
}

export function cleanEtag(etag) {
  return typeof etag === "string" ? etag.replaceAll('"', "") : null;
}

export const voicePlayUrlSeconds = PLAY_URL_SECONDS;
