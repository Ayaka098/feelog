import { MAX_IMAGE_EDGE } from "./constants";
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

    return {
      kind: "uploaded",
      label: file.name || "添付画像",
      dataUrl,
      mimeType: dataUrl.slice(5, dataUrl.indexOf(";")) || file.type,
      size: dataUrl.length,
    };
  } catch {
    return {
      kind: "uploaded",
      label: file.name || "添付画像",
      dataUrl: originalDataUrl,
      mimeType: file.type || "image/*",
      size: originalDataUrl.length,
    };
  }
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
