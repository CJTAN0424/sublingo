const express = require("express");
const cors = require("cors");
const multer = require("multer");
const OpenAI = require("openai");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "sublingo-api", speechRecognitionConfigured: Boolean(process.env.OPENAI_API_KEY) }));

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "Speech recognition is not configured yet. Add OPENAI_API_KEY in the hosting environment." });
  if (!req.file) return res.status(400).json({ error: "Please upload an audio file in the audio field." });
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const transcription = await client.audio.transcriptions.create({
      file: new File([req.file.buffer], req.file.originalname || "audio.webm", { type: req.file.mimetype || "audio/webm" }),
      model: "whisper-1",
      language: "ja",
      response_format: "text"
    });
    const japanese = typeof transcription === "string" ? transcription : transcription.text;
    const translated = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "Translate Japanese into natural Simplified Chinese. Return only the translation, with no explanation." },
        { role: "user", content: japanese }
      ]
    });
    res.json({ japanese, chinese: translated.choices[0]?.message?.content?.trim() || "" });
  } catch (error) {
    console.error("Transcription/translation failed:", error.message);
    res.status(500).json({ error: "Transcription or translation failed. Check server logs and API configuration." });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => console.log(`SubLingo API listening on ${port}`));
