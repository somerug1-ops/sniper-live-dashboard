// local server for web dashboard
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const handler = require("./api/events");

const port = Number.parseInt(process.env.PORT || process.env.WEB_PORT, 10) || 3000;
const publicDir = path.join(__dirname, "public");

const mimeTypes = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".ico": "image/x-icon"
};

const server = http.createServer((req, res) => {
  // route api events
  if (req.url.startsWith("/api/events")) {
    return handler(req, res);
  }

  // static files
  let safePath = req.url.split("?")[0];
  if (safePath === "/") safePath = "/index.html";

  const filePath = path.join(publicDir, safePath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Not Found");
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";

  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`dashboard server listening on http://localhost:${port}`);
});

module.exports = server;
