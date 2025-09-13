import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// role-to-voice mapping
const roleVoices = {
  king: "male_deep_indian",
  police: "male_strict",
  farmer: "male_simple",
  doctor: "male_doctor",
  queen: "female_royal",
  teacher: "female_teacher",
  dancer: "female_excited",
  singer: "female_singer",
};

app.post("/api/talk", async (req, res) => {
  try {
    const { text, role } = req.body;

    const voiceId = roleVoices[role?.toLowerCase()] || "default_voice";

    const response = await fetch("https://api.d-id.com/talks", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.DID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        script: {
          type: "text",
          input: text,
          voice_id: voiceId,
        },
        source_url: "https://....avatar-image-url",
      }),
    });

    const data = await response.json();
    res.json(data);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.listen(5000, () => console.log("✅ Backend running on http://localhost:5000"));
