import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const VALID_DIFFICULTIES = ["easy", "medium", "hard"];
const REPLENISH_THRESHOLD = 3;
const BANK_TARGET = 10;

// Fallback puzzles per difficulty — used when bank is empty
const FALLBACKS = {
  easy: [
    { start:"CAT", end:"DOG", path:["CAT","COT","DOT","DOG"], steps:3, par:3 },
    { start:"BAT", end:"CAR", path:["BAT","BAR","CAR"], steps:2, par:2 },
    { start:"HOT", end:"CAP", path:["HOT","COT","COP","CAP"], steps:3, par:3 },
  ],
  medium: [
    { start:"COLD", end:"WARM", path:["COLD","CORD","WORD","WARD","WARM"], steps:4, par:4 },
    { start:"FISH", end:"BIRD", path:["FISH","FIST","GIST","GIRD","BIRD"], steps:4, par:4 },
    { start:"HAND", end:"FOOT", path:["HAND","BAND","BOND","FOND","FOOD","FOOT"], steps:5, par:5 },
  ],
  hard: [
    { start:"PLANT", end:"PRISON", path:["PLANT","PLAN","PIAN","PION","PRION","PRISON"], steps:5, par:5 },
    { start:"STONE", end:"BREAD", path:["STONE","STORE","SCORE","SCARE","SHARE","SHAME","SHALE","SHAKE","BAKE","BARE","BARE","BREAD"], steps:8, par:8 },
  ],
};

export default async function handler(req, res) {
  const difficulty = req.query.difficulty || "medium";

  if (!VALID_DIFFICULTIES.includes(difficulty)) {
    return res.status(400).json({ error: "Invalid difficulty. Use easy, medium, or hard." });
  }

  const bankKey = `threadle:bank:${difficulty}`;

  try {
    // Pop one puzzle from the bank (LPOP = take from front of list)
    const raw = await redis.lpop(bankKey);
    const puzzle = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;

    // Check remaining count and trigger replenishment if low
    const remaining = await redis.llen(bankKey);
    if (remaining <= REPLENISH_THRESHOLD) {
      // Fire-and-forget replenishment — don't await, don't block the response
      const replenishUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}/api/replenish`
        : "http://localhost:3000/api/replenish";

      fetch(replenishUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": process.env.CRON_SECRET || "threadle-cron"
        },
        body: JSON.stringify({ difficulty, count: BANK_TARGET - remaining })
      }).catch(e => console.error("Replenish trigger failed:", e.message));

      console.log(`Bank for ${difficulty} at ${remaining} — replenishment triggered`);
    }

    if (!puzzle) {
      // Bank is empty — return a fallback
      const fallbacks = FALLBACKS[difficulty];
      const fallback = fallbacks[Math.floor(Math.random() * fallbacks.length)];
      return res.status(200).json({ ...fallback, classification: difficulty, fallback: true });
    }

    return res.status(200).json({ ...puzzle, classification: difficulty, fallback: false });

  } catch (e) {
    console.error("Practice API error:", e.message);
    const fallbacks = FALLBACKS[difficulty];
    const fallback = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    return res.status(200).json({ ...fallback, classification: difficulty, fallback: true });
  }
}
