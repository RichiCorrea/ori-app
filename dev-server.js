const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const startPort = Number(process.env.PORT || 5173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function createServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const requestPath = decodeURIComponent(url.pathname);
    const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^[/\\]+/, "");
    const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(root, safePath);

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, {
        "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(data);
    });
  });
}

function listen(port) {
  const server = createServer();

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && port < startPort + 20) {
      console.log(`Port ${port} is busy. Trying ${port + 1}...`);
      listen(port + 1);
      return;
    }

    throw error;
  });

  server.listen(port, "0.0.0.0", () => {
    console.log("");
    console.log("ORI is running.");
    console.log(`Computer: http://localhost:${port}`);
    console.log(`iPhone:   http://192.168.100.107:${port}`);
    console.log("");
    console.log("Keep this terminal open while testing.");
  });
}

listen(startPort);
