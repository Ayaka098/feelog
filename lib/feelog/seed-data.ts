import type { MockImage, Post } from "./types";

export const imagePresets: MockImage[] = [
  {
    kind: "mock",
    label: "窓辺",
    gradient:
      "linear-gradient(135deg, #f8a9c8 0%, #ffd9e6 42%, #b9e8ff 100%)",
    accent: "#f48bb5",
  },
  {
    kind: "mock",
    label: "夜道",
    gradient:
      "linear-gradient(135deg, #1f2937 0%, #64748b 48%, #f8a9c8 100%)",
    accent: "#94a3b8",
  },
  {
    kind: "mock",
    label: "机",
    gradient:
      "linear-gradient(135deg, #fafafa 0%, #e5e7eb 46%, #fde68a 100%)",
    accent: "#facc15",
  },
  {
    kind: "mock",
    label: "空",
    gradient:
      "linear-gradient(135deg, #dbeafe 0%, #bae6fd 50%, #fecdd3 100%)",
    accent: "#38bdf8",
  },
];

export const initialPosts: Post[] = [
  {
    id: "seed-1",
    body: "朝の空気が思ったより軽かった。\n昨日の不安がまだ少し残っているけど、コーヒーを淹れたら体のほうが先に起きてくれた感じがする。",
    createdAt: "2026-05-22T08:18:00+09:00",
    growth: { initial: 4, max: 328, plateauHours: 82, velocity: 2.2 },
    image: imagePresets[0],
  },
  {
    id: "seed-2",
    body: "返事を急がなくていい、と思えた瞬間に肩が少し下がった。ちゃんと落ち着いてからでいい。",
    createdAt: "2026-05-21T23:41:00+09:00",
    growth: { initial: 7, max: 612, plateauHours: 96, velocity: 1.65 },
  },
  {
    id: "seed-3",
    body: "昼に散歩した。何かが解決したわけじゃないけど、歩幅がそろうと考えも少しそろう。",
    createdAt: "2026-05-21T14:06:00+09:00",
    growth: { initial: 11, max: 184, plateauHours: 58, velocity: 2.6 },
    image: imagePresets[3],
  },
  {
    id: "seed-4",
    body: "あの一言が思ったより刺さっていた。怒りというより、雑に扱われた感じが残っている。",
    createdAt: "2026-05-20T19:33:00+09:00",
    growth: { initial: 2, max: 873, plateauHours: 118, velocity: 1.45 },
  },
  {
    id: "seed-5",
    body: "今日は何も進んでいないようで、実はかなり休めた日だったのかもしれない。",
    createdAt: "2026-05-18T22:09:00+09:00",
    growth: { initial: 13, max: 421, plateauHours: 72, velocity: 2.05 },
  },
  {
    id: "seed-6",
    body: "机の上を少し片付けた。視界が静かになると、頭の中もほんの少し静かになる。",
    createdAt: "2026-05-17T10:24:00+09:00",
    growth: { initial: 8, max: 255, plateauHours: 64, velocity: 2.4 },
    image: imagePresets[2],
  },
];
