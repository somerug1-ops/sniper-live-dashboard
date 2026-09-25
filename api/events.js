// serverless handler for job-isolated sniper stream
let recentChecks = [];
let seqCounter = 0;
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
          const tagged = [];
          for (const item of payload.checks) {
            const entry = {
              ...item,
              seq: ++seqCounter
            };
            recentChecks.push(entry);
            tagged.push(entry);
          }

          if (recentChecks.length > 800) {
            recentChecks = recentChecks.slice(-500);
          }

          // broadcast to active sse listeners filtered by job id
          for (const client of sseClients) {
            try {
              const matchedChecks = client.jobId
                ? tagged.filter(c => {
                    const cJob = String(c.jobId || "").toLowerCase();
                    const target = client.jobId.toLowerCase();
                    return cJob.includes(target) || target.includes(cJob);
                  })
                : [];

              if (matchedChecks.length > 0) {
                client.res.write(`data: ${JSON.stringify({ checks: matchedChecks, lastSeq: seqCounter })}\n\n`);
              }
            } catch {
              sseClients.delete(client);
            }
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, count: payload.checks?.length || 0, lastSeq: seqCounter }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.method === "DELETE") {
    recentChecks = [];
    seqCounter = 0;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const isStream = urlObj.searchParams.get("stream") === "1";
  const filterJobId = (urlObj.searchParams.get("jobId") || "").trim().toLowerCase();
  const sinceSeq = Number.parseInt(urlObj.searchParams.get("since") || "0", 10);

  // if no job id specified, return empty to preserve privacy
  if (!filterJobId) {
    if (isStream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      });
      res.write("retry: 800\n\n");
      res.write(`data: ${JSON.stringify({ checks: [] })}\n\n`);
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ recent: [], lastSeq: seqCounter }));
  }

  const filteredRecent = recentChecks.filter(c => {
    const cJob = String(c.jobId || "").toLowerCase();
    const matchJob = cJob.includes(filterJobId) || filterJobId.includes(cJob);
    const matchSeq = sinceSeq > 0 ? (c.seq || 0) > sinceSeq : true;
    return matchJob && matchSeq;
  });

  if (isStream) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });

    res.write("retry: 800\n\n");
    res.write(`data: ${JSON.stringify({
      type: "init",
      checks: sinceSeq > 0 ? filteredRecent : filteredRecent.slice(-100),
      lastSeq: seqCounter
    })}\n\n`);

    const clientObj = { res, jobId: filterJobId };
    sseClients.add(clientObj);

    // keep connection alive against proxy timeouts
    const pingTimer = setInterval(() => {
      try {
        res.write(": keepalive\n\n");
      } catch {
        clearInterval(pingTimer);
        sseClients.delete(clientObj);
      }
    }, 4000);

    req.on("close", () => {
      clearInterval(pingTimer);
      sseClients.delete(clientObj);
    });
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    recent: sinceSeq > 0 ? filteredRecent : filteredRecent.slice(-100),
    lastSeq: seqCounter,
    timestamp: Date.now()
  }));
};
