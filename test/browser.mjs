import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const types = { ".html": "text/html", ".js": "text/javascript" };
const browser = process.argv[2] ?? "safari";

const open = (url) => ({
  safari: ["open", ["-a", "Safari", url]],
  firefox: ["firefox", ["--headless", url]],
})[browser];

let child;
const finish = (code) => {
  child?.kill();
  process.exit(code);
};

const server = createServer((request, response) => {
  if (request.url === "/result") {
    let body = "";
    request.on("data", (part) => (body += part));
    request.on("end", () => {
      response.end();
      const { agent, checks, error } = JSON.parse(body);
      console.log(agent);
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

server.listen(0, () => {
  const [command, args] = open(`http://localhost:${server.address().port}/test/capture.html`);
  child = spawn(command, args, { stdio: "ignore" });
});

setTimeout(() => {
  console.log(`FAIL no answer from ${browser}`);
  finish(1);
}, Number(process.env.WAIT) || 60000);
