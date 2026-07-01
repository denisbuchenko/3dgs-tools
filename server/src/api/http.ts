import type { IncomingMessage, ServerResponse } from "node:http";

const corsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const noStoreHeaders = {
  "Cache-Control": "no-store",
  "Expires": "0",
  "Pragma": "no-cache",
};

export function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    ...corsHeaders,
    ...noStoreHeaders,
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(body));
}

export function sendNoContent(response: ServerResponse) {
  response.writeHead(204, {
    ...corsHeaders,
    ...noStoreHeaders,
  });
  response.end();
}

export async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const content = Buffer.concat(chunks).toString("utf8").trim();

  if (!content) {
    return {};
  }

  return JSON.parse(content);
}
