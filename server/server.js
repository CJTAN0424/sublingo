const express = require("express");
const cors = require("cors");
const multer = require("multer");
const OpenAI = require("openai");
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));
app.get("/", (_req, res) => res.json({ service: "SubLingo API", ok: true }));
app.get("/health", (_req, res) => res.json({
  ok: true,
  service: "sublingo-api",
  speechRecognitionConfigured: Boolean(process.env.OPENAI_API_KEY)
}));
app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "后台尚未配置 OPENAI_API_KEY。" });
  if (!req.file) return res.status(400).json({ error: "未收到音频文件。" });
  if (!req.file.mimetype.startsWith("audio/") && !req.file.mimetype.includes("webm")) {
    return res.status(400).json({ error: "音频格式不受支持。" });
  }
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const transcription = await client.audio.transcriptions.create({
      file: new File([req.file.buffer], req.file.originalname || "audio.webm", { type: req.file.mimetype || "audio/webm" }),
      model: "whisper-1",
      language: "ja",
      response_format: "text"
    });
    const japanese = (typeof transcription === "string" ? transcription : transcription.text || "").trim();
    if (!japanese) return res.json({ japanese: "", chinese: "" });
    const translated = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "Translate the Japanese speech into concise, natural Simplified Chinese subtitles. Return only the translation, without explanations. Preserve names and tone. If the input is not intelligible Japanese speech, return an empty string." },
        { role: "user", content: japanese }
      ]
    });
    res.json({ japanese, chinese: translated.choices[0]?.message?.content?.trim() || "" });
  } catch (error) {
    console.error("Transcription/translation failed:", error.message);
    res.status(500).json({ error: "识别或翻译失败，请稍后重试。" });
  }
});
const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => console.log("SubLingo API listening on " + port));