// Vercel serverless function: /api/chat
// Forwards the browser's request body straight to Anthropic's Messages API,
// attaching the API key server-side so it's never exposed to the client.
//
// Setup:
// 1. In the Vercel project dashboard, add an environment variable:
//      ANTHROPIC_API_KEY = sk-ant-...
// 2. Deploy. This file only needs to live at api/chat.js in your repo —
//    Vercel picks up anything under /api automatically, no extra config.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server misconfigured: ANTHROPIC_API_KEY is not set" });
    return;
  }

  try {
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    const data = await anthropicResponse.json();
    res.status(anthropicResponse.status).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
