import { cp, mkdir } from "node:fs/promises";

await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });

await cp(".openai/hosting.json", "dist/.openai/hosting.json");
await cp("scripts/site-worker.js", "dist/server/index.js");
