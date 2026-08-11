// Vercel serverless function: /api/chat
// Uses NVIDIA's hosted Llama 3.1 8B model.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    res.status(500).json({
      error: "Server misconfigured: NVIDIA_API_KEY is not set"
    });
    return;
  }

  try {
    const nvidiaResponse = await fetch(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          ...req.body,
          model: "meta/llama-3.1-8b-instruct"
        })
      }
    );

    const data = await nvidiaResponse.json();

    res.status(nvidiaResponse.status).json(data);
  } catch (err) {
    res.status(500).json({
      error: String(err)
    });
  }
}
