export function getAppendixBucket() {
  const runtime = globalThis as typeof globalThis & {
    __ISHIGAKI_ENV__?: { BUCKET?: R2Bucket };
  };
  const bucket = runtime.__ISHIGAKI_ENV__?.BUCKET;
  if (!bucket) {
    throw new Error(
      "Cloudflare R2 binding `BUCKET` is unavailable. Set the `r2` field in .openai/hosting.json to `BUCKET`.",
    );
  }
  return bucket;
}
