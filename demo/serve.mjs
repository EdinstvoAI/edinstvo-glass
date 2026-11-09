import { createReadStream, existsSync, statSync, realpathSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".map": "application/json" };
const port = process.env.PORT === undefined ? 4173 : Number(process.env.PORT);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError("Invalid PORT");

const server = createServer((request, response) => {
  let path;
  try { path = decodeURIComponent(new URL(request.url, "http://x").pathname); }
  catch { response.writeHead(400).end(); return; }
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cache-Control", "no-store");
  const relative = path === "/" ? "demo/index.html" : path.replace(/^\/+/, "");
  if (relative.includes("\0") || relative.split(/[\\/]/).some(part => part.startsWith(".")) || !/^(?:demo|dist|css|test)\//.test(relative) && relative !== "logo.png") { response.writeHead(404).end(); return; }
  const file = resolve(root, relative);
  try {
    if (!file.startsWith(resolve(root) + sep) || !existsSync(file) || !realpathSync(file).startsWith(resolve(root) + sep) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
  } catch { response.writeHead(404).end(); return; }
  response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).on("error", () => response.destroy()).pipe(response);
});
server.listen(port, process.env.HOST ?? "127.0.0.1", () => console.log(`http://localhost:${server.address().port}`));
