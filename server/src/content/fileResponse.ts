import { createReadStream } from "node:fs";
import type { ServerResponse } from "node:http";

export function sendFile(
  response: ServerResponse,
  filePath: string,
  contentType: string,
  size: number,
  cacheControl = "public, max-age=31536000, immutable"
) {
  const noStoreHeaders =
    cacheControl === "no-store" ? { "Expires": "0", "Pragma": "no-cache" } : {};

  response.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": cacheControl,
    "Content-Length": size,
    "Content-Type": contentType,
    ...noStoreHeaders,
  });
  createReadStream(filePath).pipe(response);
}
