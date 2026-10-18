/*
 * Gemini proxy for the DataPulse Copilot (Vercel serverless function).
 *
 * Keeps the API key on the server. Set GEMINI_API_KEY in the Vercel project settings
 * (a free key comes from Google AI Studio). Optional: GEMINI_MODEL, default below.
 *
 * Request:  POST { system: string, messages: [{ role: "user" | "assistant", text: string }] }
 * Response: { text: string } or { error: "not_configured" | "rate_limited" | "bad_request" | "upstream" }
 */
const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_MESSAGES = 20;
const MAX_TEXT = 4000;
const MAX_SYSTEM = 14000;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch (e) { return false; }
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100000) throw new Error("too large");
  }
  return JSON.parse(raw || "{}");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return send(res, 405, { error: "bad_request" }); }
  if (!sameOrigin(req)) return send(res, 403, { error: "bad_request" });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return send(res, 503, { error: "not_configured" });

  let body;
  try { body = await readJson(req); } catch (e) { return send(res, 400, { error: "bad_request" }); }

  const system = typeof body.system === "string" ? body.system.slice(0, MAX_SYSTEM) : "";
  const msgs = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  const contents = [];
  for (const m of msgs) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.text !== "string" || !m.text.trim()) continue;
    contents.push({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text.slice(0, MAX_TEXT) }] });
  }
  if (!contents.length || contents[contents.length - 1].role !== "user") return send(res, 400, { error: "bad_request" });

  const model = (process.env.GEMINI_MODEL || DEFAULT_MODEL).replace(/[^a-zA-Z0-9._-]/g, "");
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents,
        generationConfig: { temperature: 0.3, maxOutputTokens: 1500 }
      })
    });
    if (r.status === 429) return send(res, 429, { error: "rate_limited" });
    if (!r.ok) return send(res, 502, { error: "upstream", status: r.status });
    const data = await r.json();
    const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    const text = (parts || []).map((p) => p.text || "").join("").trim();
    if (!text) return send(res, 502, { error: "upstream" });
    return send(res, 200, { text });
  } catch (e) {
    return send(res, 502, { error: "upstream" });
  }
};
