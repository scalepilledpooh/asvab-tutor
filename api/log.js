import { put } from "@vercel/blob";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).end(); return; }

  let body = "";
  for await (const chunk of req) body += chunk;

  let data;
  try { data = JSON.parse(body); } catch { res.status(400).json({ error: "invalid json" }); return; }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const name = (data.studentName || "student").replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 30);
  const filename = `sessions/${ts}-${name}.json`;

  try {
    await put(filename, JSON.stringify(data, null, 2), {
      access: "public",
      contentType: "application/json",
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("blob put failed:", err);
    res.status(500).json({ error: "failed to save" });
  }
}
