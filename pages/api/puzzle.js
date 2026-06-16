import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const FALLBACK = {
  start: "COLD",
  end: "WARM",
  path: ["COLD","CORD","WORD","WARD","WARM"],
  steps: 4,
  par: 4,
  classification: "medium",
  date: new Date().toISOString().slice(0,10),
  fallback: true
};

export default async function handler(req, res) {
  try {
    const puzzle = await redis.get("threadle:puzzle");
    if (!puzzle) throw new Error("No puzzle in store");
    res.status(200).json(typeof puzzle === "string" ? JSON.parse(puzzle) : puzzle);
  } catch (e) {
    console.error("puzzle fetch failed:", e.message);
    res.status(200).json(FALLBACK);
  }
}
