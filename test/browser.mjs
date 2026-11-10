import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createSocketServer } from "node:net";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const types = { ".html": "text/html", ".js": "text/javascript" };
const browser = process.argv[2] ?? "safari";

const open = (url) => ({
  safari: ["open", ["-a", "Safari", url]],
  firefox: ["firefox", ["--headless", url]],
})[browser];

let child, driverUrl, driverSession, closing = false;
const finish = async (code) => {
  if (closing) return;
  closing = true;
  if (driverSession) await fetch(`${driverUrl}/session/${driverSession}`, { method: "DELETE", signal: AbortSignal.timeout(3000) }).catch(() => {});
  child?.kill();
  process.exit(code);
};

async function safariSession(url) {
  const reserve = createSocketServer();
  await new Promise(resolve => reserve.listen(0, "127.0.0.1", resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  driverUrl = `http://127.0.0.1:${port}`;
  child = spawn("/usr/bin/safaridriver", ["--port", String(port)], { stdio: ["ignore", "ignore", "pipe"] });
  let log = "";
  child.stderr.on("data", chunk => { log = (log + chunk).slice(-2000); });
  child.on("error", error => { console.error(error.message); finish(1); });
  let ready = false;
  for (let attempt = 0; attempt < 100 && !ready; attempt++) {
    try { ready = (await fetch(`${driverUrl}/status`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (!ready) await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error(`Safari WebDriver did not start: ${log}`);
  const command = async (path, body) => {
    const response = await fetch(`${driverUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
    const result = await response.json();
    if (!response.ok || result.value?.error) throw new Error(result.value?.message ?? `WebDriver HTTP ${response.status}`);
    return result.value;
  };
  const session = await command("/session", { capabilities: { alwaysMatch: { browserName: "safari" } } });
  driverSession = session.sessionId;
  await command(`/session/${driverSession}/window/rect`, { x: 0, y: 0, width: 1280, height: 900 });
  console.log("Safari automation window: 1280x900");
  await command(`/session/${driverSession}/url`, { url });
}

const server = createServer((request, response) => {
  if (request.url === "/result") {
    let body = "";
    request.on("data", (part) => (body += part));
    request.on("end", () => {
      response.end();
      const { agent, webgl, notes, checks, error } = JSON.parse(body);
      console.log(agent, webgl ? "with WebGL 2" : "without WebGL 2");
      for (const note of notes) console.log(`note: ${note}`);
      for (const [name, passed] of Object.entries(checks)) console.log(`${passed ? "ok  " : "FAIL"} ${name}`);
      if (error) console.log(`error: ${error}`);
      finish(!error && Object.keys(checks).length >= 5 && Object.values(checks).every(Boolean) ? 0 : 1);
    });
    return;
  }
  const file = join(root, normalize(decodeURIComponent(new URL(request.url, "http://x").pathname)));
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) return response.writeHead(404).end();
  response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
});

server.listen(0, async () => {
  const url = `http://localhost:${server.address().port}/test/capture.html`;
  try {
    if (browser === "safari" && process.env.CI) await safariSession(url);
    else {
      const [command, args] = open(url);
      child = spawn(command, args, { stdio: "ignore" });
    }
  } catch (error) { if (!closing) { console.error(`FAIL ${error.message}`); finish(1); } }
});

setTimeout(() => {
  console.log(`FAIL no answer from ${browser}`);
  finish(1);
}, Number(process.env.WAIT) || 60000);
