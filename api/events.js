// serverless handler for job-isolated sniper stream
let recentChecks = [];
const maxChecks = 400;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-dashboard-key");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // bot pushes checks batch
  if (req.method === "POST") {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
    });

    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");

        if (Array.isArray(payload.checks)) {
          for (const item of payload.checks) {
            const entry = {
              ...item,
              id: item.id || `${item.platform || ''}-${item.username || ''}-${item.timestamp || Date.now()}-${Math.random().toString(36).slice(2, 6)}`
            };
            recentChecks.push(entry);
          }

          if (recentChecks.length > maxChecks) {
            recentChecks = recentChecks.slice(-maxChecks);
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, count: payload.checks?.length || 0 }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.method === "DELETE") {
    recentChecks = [];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const filterJobId = (urlObj.searchParams.get("jobId") || "").trim().toLowerCase();

  // if no job id specified, return empty to preserve privacy
  if (!filterJobId) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ recent: [] }));
  }

  const filteredRecent = recentChecks.filter(c => {
    const cJob = String(c.jobId || "").toLowerCase();
    return cJob.includes(filterJobId) || filterJobId.includes(cJob);
  });

  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate"
  });
  res.end(JSON.stringify({
    recent: filteredRecent.slice(-80),
    timestamp: Date.now()
  }));
};
