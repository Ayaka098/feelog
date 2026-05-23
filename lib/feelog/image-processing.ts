import { MAX_IMAGE_EDGE, PROFILE_AVATAR_EDGE } from "./constants";
import type { UploadedImage } from "./types";

export async function fileToUploadedImage(file: File): Promise<UploadedImage> {
  const originalDataUrl = await readFileAsDataUrl(file);

  try {
    const image = await loadImageElement(originalDataUrl);
    const scale = Math.min(
      1,
      MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("画像を変換できませんでした");
    }

    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    const webpDataUrl = canvas.toDataURL("image/webp", 0.82);
    const dataUrl = webpDataUrl.startsWith("data:image/webp")
      ? webpDataUrl
      : canvas.toDataURL("image/jpeg", 0.84);
    const blob = dataUrlToBlob(dataUrl);

    return {
      kind: "uploaded",
      label: file.name || "添付画像",
      dataUrl,
      mimeType: blob.type || file.type || "image/*",
      size: blob.size,
    };
  } catch {
    const blob = dataUrlToBlob(originalDataUrl);

    return {
      kind: "uploaded",
      label: file.name || "添付画像",
      dataUrl: originalDataUrl,
      mimeType: blob.type || file.type || "image/*",
      size: blob.size || file.size,
    };
  }
}

export function uploadedImageToBlob(image: UploadedImage) {
  return dataUrlToBlob(image.dataUrl);
}

export function dataUrlToBlob(dataUrl: string) {
  const separatorIndex = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || separatorIndex < 0) {
    throw new Error("画像データを変換できませんでした");
  }

  const header = dataUrl.slice(0, separatorIndex);
  const body = dataUrl.slice(separatorIndex + 1);
  const mimeType = header.slice(5).split(";")[0] || "application/octet-stream";
  const decoded = header.includes(";base64") ? atob(body) : decodeURIComponent(body);
  const bytes = new Uint8Array(decoded.length);

  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

export async function fileToAvatarDataUrl(file: File) {
  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(originalDataUrl);
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(0, Math.round((image.naturalWidth - sourceSize) / 2));
  const sourceY = Math.max(0, Math.round((image.naturalHeight - sourceSize) / 2));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("プロフィール画像を変換できませんでした");
  }

  canvas.width = PROFILE_AVATAR_EDGE;
  canvas.height = PROFILE_AVATAR_EDGE;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    PROFILE_AVATAR_EDGE,
    PROFILE_AVATAR_EDGE,
  );

  const webpDataUrl = canvas.toDataURL("image/webp", 0.86);
  return webpDataUrl.startsWith("data:image/webp")
    ? webpDataUrl
    : canvas.toDataURL("image/jpeg", 0.88);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("画像を読み込めませんでした"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("画像を読み込めませんでした"));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("画像を読み込めませんでした"));
    image.src = dataUrl;
  });
}
