import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

test("keeps the map center fixed during wheel zoom", async () => {
  const html = await readFile(new URL("../public/map.html", import.meta.url), "utf8");

  assert.match(html, /map\.scrollZoom\.disable\(\)/);
  assert.match(html, /addEventListener\('wheel'.*?center:map\.getCenter\(\).*?passive:false/s);
});

test("positions map markers outside document flow", async () => {
  const html = await readFile(new URL("../public/map.html", import.meta.url), "utf8");

  assert.match(html, /\.marker\{position:absolute;/);
  assert.doesNotMatch(html, /\.marker\{position:relative;/);
});

test("draws itinerary locations in chronological order", async () => {
  const html = await readFile(new URL("../public/itinerary-map.html", import.meta.url), "utf8");

  assert.match(html, /LineString/);
  assert.match(html, /points\.map\(point=>point\.coordinates\)/);
  assert.match(html, /String\(index\+1\)\.padStart\(2,'0'\)/);
});
