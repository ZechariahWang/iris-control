interface ChatRequestBody {
  messages?: unknown;
}

export async function POST(request: Request) {
  const openclawUrl = process.env.OPENCLAW_URL;
  const openclawToken = process.env.OPENCLAW_TOKEN;
  if (!openclawUrl || !openclawToken) {
    return Response.json({ error: "OpenClaw env vars not set" }, { status: 500 });
  }

  const body: ChatRequestBody = await request.json();
  const messages = body.messages;
  if (!Array.isArray(messages)) {
    return Response.json({ error: "messages must be an array" }, { status: 400 });
  }

  const base = openclawUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openclawToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENCLAW_AGENT,
      messages: messages,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return Response.json({ error: detail }, { status: res.status });
  }

  const data = await res.json();
  const reply = data.choices[0].message.content;
  return Response.json({ reply: reply });
}
