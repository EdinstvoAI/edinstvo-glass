import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { get } from "node:http";
import { once } from "node:events";
import { test } from "node:test";

test("development server rejects malformed and private paths without crashing", async t => {
  const child = spawn(process.execPath, ["demo/serve.mjs"], { cwd: new URL("..", import.meta.url), env: { ...process.env, PORT: "0", HOST: "127.0.0.1" }, stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => child.kill());
  const startup = once(child.stdout, "data");
  const output = await Promise.race([startup.then(([data]) => data.toString()), once(child, "exit").then(([code]) => { throw new Error(`Server exited: ${code}`); })]);
  const port = Number(output.match(/localhost:(\d+)/)?.[1]);
  assert.ok(port > 0);
  const status = path => new Promise((resolve, reject) => {
    get({ hostname: "127.0.0.1", port, path }, response => { response.resume(); resolve(response.statusCode); }).on("error", reject);
  });
  for (const path of ["/.git/config", "/.env", "/%2e%2e/.git/config", "/src/material.ts"]) assert.equal(await status(path), 404, path);
  assert.equal(await status("/demo/%ZZ"), 400);
  assert.equal(await status("/"), 200);
  assert.equal(await status("/dist/index.js"), 200);
  assert.equal(child.exitCode, null);
});
