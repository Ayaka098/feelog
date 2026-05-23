export type LikeGrowth = {
  initial: number;
  max: number;
  plateauHours: number;
  velocity: number;
};

export type MockImage = {
  kind: "mock";
  label: string;
  gradient: string;
  accent: string;
};

export type UploadedImage = {
  kind: "uploaded";
  label: string;
  dataUrl: string;
  mimeType: string;
  size: number;
};

export type PostImage = MockImage | UploadedImage;

export type Post = {
  id: string;
  userId?: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
  growth: LikeGrowth;
  image?: PostImage;
};

export type DraftImage = PostImage | undefined;

export type DateRange = {
  from: string;
  to: string;
};
