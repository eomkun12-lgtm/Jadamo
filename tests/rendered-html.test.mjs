import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { googleMapsCoordinates, isGoogleMapsUrl } from "../lib/google-maps.ts";

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
  assert.match(html, /@media\(max-width:600px\).*?\.marker\.is-active \.tag\{display:none\}/s);
});

test("logbook loads all dive logs in one request and avoids false zero summaries", async () => {
  const route = await readFile(new URL("../app/api/dive-logs/route.ts", import.meta.url), "utf8");
  const logbook = await readFile(new URL("../app/logbook/logbook.tsx", import.meta.url), "utf8");

  assert.match(route, /destinationId\s*\?\s*await db[\s\S]*?:\s*await db/);
  assert.match(logbook, /fetch\("\/api\/dive-logs", \{ cache: "no-store" \}\)/);
  assert.match(logbook, /const summary = \(value: string \| number\) => loading \? "…" : value;/);
});

test("draws itinerary locations in chronological order", async () => {
  const html = await readFile(new URL("../public/itinerary-map.html", import.meta.url), "utf8");

  assert.match(html, /LineString/);
  assert.match(html, /points\.map\(point=>point\.coordinates\)/);
  assert.match(html, /String\(point\.order\)\.padStart\(2,'0'\)/);
  assert.match(html, /jadamo-geocode-v3/);
  assert.match(html, /Math\.hypot/);
  assert.match(html, /124\.1921401,24\.3414496/);
  assert.match(html, /request===lastRequest/);
  assert.match(html, /catch\{return null\}/);
});

test("extracts coordinates only from Google Maps links", () => {
  assert.deepEqual(googleMapsCoordinates("https://www.google.com/maps/place/x/@24.3000,124.1000,17z/data=!4m6!8m2!3d24.3414496!4d124.1921401"), {
    latitude: 24.3414496,
    longitude: 124.1921401,
  });
  assert.equal(isGoogleMapsUrl("https://example.com/@24.3,124.1"), false);
  assert.equal(googleMapsCoordinates("https://example.com/@24.3,124.1"), null);
});
