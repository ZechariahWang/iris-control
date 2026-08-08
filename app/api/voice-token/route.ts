import { GoogleGenAI } from "@google/genai";

export async function POST() {
  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ error: "GEMINI_API_KEY is not set" }, { status: 500 });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const token = await ai.authTokens.create({ config: { uses: 1 } });

  return Response.json({
    token: token.name,
    model: process.env.GEMINI_LIVE_MODEL || "gemini-3.1-flash-live-preview",
    voice: process.env.GEMINI_VOICE || "Leda",
  });
}
