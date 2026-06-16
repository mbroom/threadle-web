import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { currentWord, targetWord, optimalPath } = req.body;
  if (!currentWord || !targetWord) return res.status(400).json({ error: "Missing required fields" });

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 100,
      system: `You are a hint generator for a word chain puzzle game. 
The player needs to get from their current word to the target word by changing one letter at a time.
The optimal path is: ${optimalPath ? optimalPath.join(" → ") : "unknown"}

Your job: suggest the single best next word for the player to try.
Rules: each step changes exactly one letter, adds one letter, or removes one letter. Every word must be real English.

Respond with ONLY JSON: {"nextWord": "WORD"}`,
      messages: [{
        role: "user",
        content: `Current word: ${currentWord}\nTarget word: ${targetWord}\nWhat should the next word be?`
      }]
    });

    const text = response.content.map(b => b.text || "").join("");
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    res.status(200).json({ nextWord: parsed.nextWord?.toUpperCase() });
  } catch (e) {
    console.error("Hint API error:", e.message);
    res.status(200).json({ nextWord: null });
  }
}
