// vercel serverless handler for sniper live stream
let recentChecks = [];
let availableHits = [];
let latestStats = {
  totalScanned: 0,
  totalAvailable: 0,
  ratePerSec: 0,
  uptimeSec: 0
};
let sseListeners = new Set();

module.exports = async function handler(req, res) {
  // enable cors
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-dashboard-key");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // bot pushes new check batch
  if (req.method === "POST") {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
    });

    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        if (payload.stats) {
          latestStats = { ...latestStats, ...payload.stats };
        }

        if (Array.isArray(payload.checks)) {
          for (const item of payload.checks) {
            recentChecks.push(item);
            if (item.status === "available") {
              availableHits.unshift({
                ...item,
                id: `${item.platform}-${item.username}-${Date.now()}`
              });
            }
          }

          // cap in-memory buffers
          if (recentChecks.length > 200) {
            recentChecks = recentChecks.slice(-150);
          }
          if (availableHits.length > 100) {
            availableHits = availableHits.slice(0, 80);
          }

          // notify active sse listeners
          const sseData = `data: ${JSON.stringify({
            checks: payload.checks,
            stats: latestStats,
            timestamp: Date.now()
          })}\n\n`;

          for (const listener of sseListeners) {
            try {
              listener.write(sseData);
            } catch {
              sseListeners.delete(listener);
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

  // clear history if requested
  if (req.method === "DELETE") {
    recentChecks = [];
    availableHits = [];
    latestStats.totalAvailable = 0;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // handle client get
  const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const isStream = urlObj.searchParams.get("stream") === "1";

  if (isStream) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });

    // send initial snapshot
    res.write(`data: ${JSON.stringify({
      type: "init",
      stats: latestStats,
      hits: availableHits.slice(0, 50),
      recent: recentChecks.slice(-40)
    })}\n\n`);

    sseListeners.add(res);

    req.on("close", () => {
      sseListeners.delete(res);
    });
    return;
  }

  // default json snapshot response
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    stats: latestStats,
    hits: availableHits.slice(0, 50),
    recent: recentChecks.slice(-50),
    timestamp: Date.now()
  }));
};
