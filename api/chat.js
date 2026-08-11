// Vercel serverless function
// Converts the Anthropic-style request used by the existing frontend
// into NVIDIA's OpenAI-compatible Chat Completions format,
// then converts NVIDIA's response back into the Anthropic-style
// response expected by index.html.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "Server misconfigured: NVIDIA_API_KEY is not set"
    });
  }

  try {
    const body = req.body || {};

    // Convert Anthropic tool definitions to OpenAI/NVIDIA format.
    const tools = Array.isArray(body.tools)
      ? body.tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description || "",
            parameters: tool.input_schema || {
              type: "object",
              properties: {}
            }
          }
        }))
      : undefined;

    // Convert Anthropic-style messages to OpenAI/NVIDIA messages.
    const messages = [];

    if (body.system) {
      messages.push({
        role: "system",
        content: body.system
      });
    }

    for (const message of body.messages || []) {
      const content = message.content;

      // Normal text message
      if (typeof content === "string") {
        messages.push({
          role: message.role,
          content
        });
        continue;
      }

      if (!Array.isArray(content)) {
        continue;
      }

      // Anthropic assistant message containing text/tool_use blocks
      if (message.role === "assistant") {
        const textParts = content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");

        const toolCalls = content
          .filter((block) => block.type === "tool_use")
          .map((block) => ({
            id: block.id,
            type: "function",
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input || {})
            }
          }));

        const assistantMessage = {
          role: "assistant",
          content: textParts || null
        };

        if (toolCalls.length) {
          assistantMessage.tool_calls = toolCalls;
        }

        messages.push(assistantMessage);
        continue;
      }

      // Anthropic user message containing tool_result blocks
      if (message.role === "user") {
        for (const block of content) {
          if (block.type === "tool_result") {
            messages.push({
              role: "tool",
              tool_call_id: block.tool_use_id,
              content:
                typeof block.content === "string"
                  ? block.content
                  : JSON.stringify(block.content)
            });
          } else if (block.type === "text") {
            messages.push({
              role: "user",
              content: block.text
            });
          }
        }
      }
    }

    const nvidiaBody = {
      model: "meta/llama-3.1-8b-instruct",
      messages,
      max_tokens: body.max_tokens || 1200,
      temperature: 0.2,
      stream: false
    };

    if (tools && tools.length) {
      nvidiaBody.tools = tools;
      nvidiaBody.tool_choice = "auto";
    }

    const nvidiaResponse = await fetch(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(nvidiaBody)
      }
    );

    const data = await nvidiaResponse.json();

    if (!nvidiaResponse.ok) {
      return res.status(nvidiaResponse.status).json(data);
    }

    const choice = data.choices?.[0];
    const message = choice?.message;

    if (!message) {
      return res.status(500).json({
        error: "NVIDIA returned an unexpected response",
        details: data
      });
    }

    // Convert NVIDIA tool calls back to Anthropic tool_use blocks.
    if (message.tool_calls && message.tool_calls.length) {
      const content = [];

      if (message.content) {
        content.push({
          type: "text",
          text: message.content
        });
      }

      for (const toolCall of message.tool_calls) {
        let input = {};

        try {
          input = JSON.parse(
            toolCall.function?.arguments || "{}"
          );
        } catch {
          input = {};
        }

        content.push({
          type: "tool_use",
          id: toolCall.id,
          name: toolCall.function?.name,
          input
        });
      }

      return res.status(200).json({
        id: data.id,
        type: "message",
        role: "assistant",
        model: data.model,
        content,
        stop_reason: "tool_use"
      });
    }

    // Normal NVIDIA text response → Anthropic-style response.
    return res.status(200).json({
      id: data.id,
      type: "message",
      role: "assistant",
      model: data.model,
      content: [
        {
          type: "text",
          text: message.content || ""
        }
      ],
      stop_reason: "end_turn"
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: String(err)
    });
  }
}
