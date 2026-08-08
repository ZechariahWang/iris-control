export async function POST(request) {
  const body = await request.json();
  const messages = body.messages;
  if (!Array.isArray(messages)) {
    return Response.json({ error: "messages must be an array" }, { status: 400 });
  }

  const base = process.env.OPENCLAW_URL.replace(/\/+$/, "");
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENCLAW_TOKEN}`,
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
