// serverless handler for job-isolated sniper stream
let recentChecks = [];
const maxChecks = 400;
let sseClients = new Set();

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
          const newEntries = [];
          for (const item of payload.checks) {
            const entry = {
              ...item,
              id: item.id || `${item.platform || ''}-${item.username || ''}-${item.timestamp || Date.now()}-${Math.random().toString(36).slice(2, 6)}`
            };
            recentChecks.push(entry);
            newEntries.push(entry);
          }

          if (recentChecks.length > maxChecks) {
            recentChecks = recentChecks.slice(-maxChecks);
          }

          // immediate instant push to connected sse clients
          for (const client of sseClients) {
            try {
              const matched = client.jobId
                ? newEntries.filter(c => {
                    const cJob = String(c.jobId || "").toLowerCase();
                    const target = client.jobId.toLowerCase();
                    return cJob.includes(target) || target.includes(cJob);
                  })
                : [];

              if (matched.length > 0) {
                client.res.write(`data: ${JSON.stringify({ checks: matched })}\n\n`);
              }
            } catch {
              sseClients.delete(client);
            }
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
  const isStream = urlObj.searchParams.get("stream") === "1";

  // if no job id specified, return empty to preserve privacy
  if (!filterJobId) {
    if (isStream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      });
      res.write("retry: 500\n\n");
      res.write(`data: ${JSON.stringify({ checks: [] })}\n\n`);
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ recent: [] }));
  }

  const filteredRecent = recentChecks.filter(c => {
    const cJob = String(c.jobId || "").toLowerCase();
    return cJob.includes(filterJobId) || filterJobId.includes(cJob);
  });

  if (isStream) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive"
    });

    res.write("retry: 500\n\n");
    // send initial batch immediately
    res.write(`data: ${JSON.stringify({ type: "init", checks: filteredRecent.slice(-80) })}\n\n`);

    const clientObj = { res, jobId: filterJobId };
    sseClients.add(clientObj);

    const pingTimer = setInterval(() => {
      try {
        res.write(": keepalive\n\n");
      } catch {
        clearInterval(pingTimer);
        sseClients.delete(clientObj);
      }
    }, 3000);

    req.on("close", () => {
      clearInterval(pingTimer);
      sseClients.delete(clientObj);
    });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate"
  });
  res.end(JSON.stringify({
    recent: filteredRecent.slice(-80),
    timestamp: Date.now()
  }));
};
