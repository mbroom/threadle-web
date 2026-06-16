import path from "path";
import fs from "fs";

export default function handler(req, res) {
  try {
    const puzzlePath = path.join(process.cwd(), "puzzle.json");
    const puzzle = JSON.parse(fs.readFileSync(puzzlePath, "utf8"));

    // Cache for 1 hour — puzzle only changes once daily
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.status(200).json(puzzle);
  } catch (e) {
    // Fallback puzzle if file is missing — players never see a failure
    res.status(200).json({
      start: "COLD",
      end: "WARM",
      path: ["COLD","CORD","WORD","WARD","WARM"],
      steps: 4,
      classification: "medium",
      date: new Date().toISOString().slice(0,10),
      par: 4
    });
  }
}
