import { list } from "@vercel/blob";

const TUTOR_KEY = process.env.TUTOR_KEY || "tutor";

export default async function handler(req, res) {
  const qs = req.url.includes("?") ? req.url.split("?")[1] : "";
  const params = new URLSearchParams(qs);
  if (params.get("key") !== TUTOR_KEY) {
    res.setHeader("Content-Type", "text/html");
    res.status(401).send(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px">
      <h2>Access denied</h2><p>Append <code>?key=YOUR_KEY</code> to the URL.</p></body></html>`);
    return;
  }

  let sessions = [];
  try {
    const { blobs } = await list({ prefix: "sessions/" });
    const fetched = await Promise.all(
      blobs
        .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
        .map(async (blob) => {
          try {
            const r = await fetch(blob.url);
            return await r.json();
          } catch { return null; }
        })
    );
    sessions = fetched.filter(Boolean);
  } catch (err) {
    console.error("list failed:", err);
  }

  res.setHeader("Content-Type", "text/html");
  res.send(renderHTML(sessions));
}

function fmt(ts) {
  try { return new Date(ts).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return ts; }
}

function pct(c, t) { return t ? Math.round(c / t * 100) + "%" : "—"; }

function scoreColor(c, t) {
  if (!t) return "#6b7280";
  const p = c / t;
  if (p >= 0.8) return "#166534";
  if (p >= 0.6) return "#92400e";
  return "#991b1b";
}

function renderHTML(sessions) {
  const rows = sessions.map((s, si) => {
    const totalPct = pct(s.totalCorrect, s.totalItems);
    const color = scoreColor(s.totalCorrect, s.totalItems);
    const sectionSummary = (s.sections || []).map(sec =>
      `<span style="margin-right:12px"><strong>${sec.code}</strong>: ${sec.score ?? "?"}/${sec.total ?? "?"}</span>`
    ).join("");

    const questionRows = (s.sections || []).flatMap(sec =>
      (sec.questions || []).map((q, qi) => {
        const correct = q.correct;
        const bg = correct ? "#f0fdf4" : "#fff1f2";
        const border = correct ? "#bbf7d0" : "#fecaca";
        const icon = correct ? "✓" : "✗";
        const iconColor = correct ? "#166534" : "#991b1b";
        const stemShort = (q.stem || "").replace(/PASSAGE:[\s\S]*?QUESTION:/i, "").trim().slice(0, 120);
        return `<tr style="background:${bg};border-bottom:1px solid ${border}">
          <td style="padding:8px 10px;font-weight:700;color:${iconColor};text-align:center;width:32px">${icon}</td>
          <td style="padding:8px 10px;font-size:13px;color:#374151"><span style="background:#e5e7eb;border-radius:4px;padding:2px 6px;font-size:11px;font-weight:700;margin-right:6px">${sec.code}</span>${stemShort}${q.stem && q.stem.length > 120 ? "…" : ""}</td>
          <td style="padding:8px 10px;font-size:13px;color:#374151">${q.studentText || "No answer"}</td>
          <td style="padding:8px 10px;font-size:13px;color:#166534;font-weight:600">${q.correctText || ""}</td>
          <td style="padding:8px 10px;font-size:12px;color:#6b7280;max-width:200px">${q.explanation || ""}</td>
        </tr>`;
      })
    ).join("");

    return `
    <div style="background:#fff;border:1px solid #d1d5db;border-radius:12px;margin-bottom:20px;overflow:hidden">
      <div style="padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;cursor:pointer;user-select:none" onclick="toggle(${si})">
        <div>
          <span style="font-size:18px;font-weight:700;color:#111827">${s.studentName || "Student"}</span>
          <span style="margin-left:12px;font-size:13px;color:#6b7280">${fmt(s.timestamp)}</span>
          <span style="margin-left:10px;font-size:12px;background:#e5e7eb;border-radius:4px;padding:2px 7px">${s.sessionType || "FULL"} · ${s.mode || ""}</span>
        </div>
        <div style="display:flex;align-items:center;gap:16px">
          <div style="font-size:13px;color:#374151">${sectionSummary}</div>
          <div style="font-size:22px;font-weight:700;color:${color}">${totalPct}</div>
          <div id="arrow${si}" style="font-size:18px;color:#9ca3af;transition:transform 0.2s">▼</div>
        </div>
      </div>
      <div id="detail${si}" style="display:none;border-top:1px solid #e5e7eb;overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;min-width:600px">
          <thead><tr style="background:#f9fafb">
            <th style="padding:8px 10px;text-align:left;font-size:12px;color:#6b7280;width:32px"></th>
            <th style="padding:8px 10px;text-align:left;font-size:12px;color:#6b7280">Question</th>
            <th style="padding:8px 10px;text-align:left;font-size:12px;color:#6b7280">Student answered</th>
            <th style="padding:8px 10px;text-align:left;font-size:12px;color:#6b7280">Correct answer</th>
            <th style="padding:8px 10px;text-align:left;font-size:12px;color:#6b7280">Explanation</th>
          </tr></thead>
          <tbody>${questionRows}</tbody>
        </table>
      </div>
    </div>`;
  }).join("");

  const empty = sessions.length === 0
    ? `<div style="text-align:center;padding:60px;color:#6b7280">No sessions logged yet. Have your student complete a practice test first.</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>AFQT Session Log</title>
<style>
  body { margin:0; font-family: -apple-system, Arial, sans-serif; background:#f4f6f8; color:#111827; }
  .wrap { max-width:1100px; margin:0 auto; padding:24px 16px; }
  h1 { margin:0 0 4px; font-size:26px; }
  .sub { color:#6b7280; margin-bottom:24px; font-size:14px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>AFQT Session Log</h1>
  <p class="sub">${sessions.length} session${sessions.length !== 1 ? "s" : ""} recorded — click a row to expand question detail</p>
  ${rows}${empty}
</div>
<script>
function toggle(i) {
  const d = document.getElementById("detail"+i);
  const a = document.getElementById("arrow"+i);
  const open = d.style.display !== "none";
  d.style.display = open ? "none" : "block";
  a.style.transform = open ? "" : "rotate(180deg)";
}
</script>
</body>
</html>`;
}
