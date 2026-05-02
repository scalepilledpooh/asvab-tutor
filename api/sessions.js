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

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function topicLabel(q) {
  return q.topicLabel || q.label || q.topic || "Other";
}

function sessionTopicStats(session) {
  const stats = {};
  if (Array.isArray(session.topicStats) && session.topicStats.length) {
    session.topicStats.forEach(t => {
      const key = t.topic || t.label || "other";
      stats[key] = {
        label: t.label || t.topic || "Other",
        correct: Number(t.correct) || 0,
        total: Number(t.total) || 0,
      };
    });
    return stats;
  }
  (session.sections || []).forEach(sec => {
    (sec.questions || []).forEach(q => {
      const key = q.topic || q.topicLabel || "other";
      if (!stats[key]) stats[key] = { label: topicLabel(q), correct: 0, total: 0 };
      stats[key].total++;
      if (q.correct) stats[key].correct++;
    });
  });
  return stats;
}

function topicRows(stats, missedOnly = false) {
  return Object.values(stats)
    .filter(v => v.total && (!missedOnly || v.correct < v.total))
    .sort((a, b) => (a.correct / a.total) - (b.correct / b.total) || b.total - a.total);
}

function aggregateTopicStats(sessions) {
  const agg = {};
  sessions.forEach(session => {
    Object.entries(sessionTopicStats(session)).forEach(([key, v]) => {
      if (!agg[key]) agg[key] = { label: v.label, correct: 0, total: 0 };
      agg[key].correct += v.correct;
      agg[key].total += v.total;
    });
  });
  return agg;
}

function renderHTML(sessions) {
  const allWeakRows = topicRows(aggregateTopicStats(sessions), true).slice(0, 10);
  const aggregateWeak = allWeakRows.length ? `
    <div class="panel">
      <h2>Weak Areas Across Sessions</h2>
      <table class="topic-table">
        <thead><tr><th>Problem type</th><th>Correct</th><th>Total</th><th>Accuracy</th></tr></thead>
        <tbody>
          ${allWeakRows.map(v => `<tr>
            <td>${escHtml(v.label)}</td>
            <td>${v.correct}</td>
            <td>${v.total}</td>
            <td style="font-weight:700;color:${scoreColor(v.correct, v.total)}">${pct(v.correct, v.total)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>` : "";

  const rows = sessions.map((s, si) => {
    const totalPct = pct(s.totalCorrect, s.totalItems);
    const color = scoreColor(s.totalCorrect, s.totalItems);
    const isGre = s.sessionKind === "GRE";
    const kindBadge = isGre
      ? `<span style="margin-left:6px;font-size:11px;background:#ede9fe;color:#6d28d9;border-radius:4px;padding:2px 7px;font-weight:700">GRE QUANT</span>`
      : `<span style="margin-left:6px;font-size:11px;background:#dbeafe;color:#1d4ed8;border-radius:4px;padding:2px 7px;font-weight:700">AFQT</span>`;
    const sectionSummary = (s.sections || []).map(sec => {
      const diff = sec.difficulty ? ` <span style="font-size:11px;color:#6b7280">(${escHtml(sec.difficulty)})</span>` : "";
      return `<span style="margin-right:12px"><strong>${escHtml(sec.code)}</strong>: ${sec.score ?? "?"}/${sec.total ?? "?"}${diff}</span>`;
    }).join("");
    const estimated = isGre && s.estimatedScore
      ? `<span style="margin-left:10px;font-size:12px;background:#f5f3ff;color:#6d28d9;border-radius:4px;padding:2px 7px;font-weight:700">~${s.estimatedScore}</span>`
      : "";
    const weakRows = topicRows(sessionTopicStats(s), true).slice(0, 4);
    const weakSummary = weakRows.length
      ? `<div style="font-size:12px;color:#6b7280;margin-top:6px">Weak areas: ${weakRows.map(v => `${escHtml(v.label)} ${v.correct}/${v.total}`).join(" · ")}</div>`
      : `<div style="font-size:12px;color:#166534;margin-top:6px">No missed problem types recorded.</div>`;

    const questionRows = (s.sections || []).flatMap(sec =>
      (sec.questions || []).map((q, qi) => {
        const correct = q.correct;
        const bg = correct ? "#f0fdf4" : "#fff1f2";
        const border = correct ? "#bbf7d0" : "#fecaca";
        const icon = correct ? "✓" : "✗";
        const iconColor = correct ? "#166534" : "#991b1b";
        const stemShort = (q.stem || "").replace(/PASSAGE:[\s\S]*?QUESTION:/i, "").trim().slice(0, 140);
        const typeTag = q.qtype ? `<span style="background:#ede9fe;color:#6d28d9;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;margin-right:4px">${escHtml(q.qtype)}</span>` : "";
        const topicTag = `<span style="background:#f3f4f6;color:#374151;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;margin-right:4px">${escHtml(topicLabel(q))}</span>`;
        return `<tr style="background:${bg};border-bottom:1px solid ${border}">
          <td style="padding:8px 10px;font-weight:700;color:${iconColor};text-align:center;width:32px">${icon}</td>
          <td style="padding:8px 10px;font-size:13px;color:#374151"><span style="background:#e5e7eb;border-radius:4px;padding:2px 6px;font-size:11px;font-weight:700;margin-right:6px">${escHtml(sec.code)}</span>${typeTag}${topicTag}${escHtml(stemShort)}${q.stem && q.stem.length > 140 ? "…" : ""}</td>
          <td style="padding:8px 10px;font-size:13px;color:#374151">${escHtml(q.studentText || "No answer")}</td>
          <td style="padding:8px 10px;font-size:13px;color:#166534;font-weight:600">${escHtml(q.correctText || "")}</td>
          <td style="padding:8px 10px;font-size:12px;color:#6b7280;max-width:200px">${escHtml(q.explanation || "")}</td>
        </tr>`;
      })
    ).join("");

    return `
    <div style="background:#fff;border:1px solid #d1d5db;border-radius:12px;margin-bottom:20px;overflow:hidden">
      <div style="padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;cursor:pointer;user-select:none" onclick="toggle(${si})">
        <div>
          <span style="font-size:18px;font-weight:700;color:#111827">${escHtml(s.studentName || "Student")}</span>
          ${kindBadge}
          <span style="margin-left:12px;font-size:13px;color:#6b7280">${escHtml(fmt(s.timestamp))}</span>
          <span style="margin-left:10px;font-size:12px;background:#e5e7eb;border-radius:4px;padding:2px 7px">${escHtml(s.sessionType || "FULL")} · ${escHtml(s.mode || "")}</span>
          ${estimated}
          ${weakSummary}
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
<title>Tutor Session Log (AFQT + GRE Quant)</title>
<style>
  body { margin:0; font-family: -apple-system, Arial, sans-serif; background:#f4f6f8; color:#111827; }
  .wrap { max-width:1100px; margin:0 auto; padding:24px 16px; }
  h1 { margin:0 0 4px; font-size:26px; }
  .sub { color:#6b7280; margin-bottom:24px; font-size:14px; }
  .panel { background:#fff;border:1px solid #d1d5db;border-radius:12px;margin:18px 0 20px;padding:16px 20px; }
  .panel h2 { font-size:18px;margin:0 0 10px; }
  .topic-table { width:100%;border-collapse:collapse; }
  .topic-table th, .topic-table td { border-bottom:1px solid #e5e7eb;padding:8px 10px;text-align:left;font-size:13px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Tutor Session Log</h1>
  <p class="sub">${sessions.length} session${sessions.length !== 1 ? "s" : ""} recorded — click a row to expand question detail</p>
  ${aggregateWeak}
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
