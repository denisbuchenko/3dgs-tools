import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

const websocketGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const clients = new Set<Duplex>();

export function handleWebSocketUpgrade(request: IncomingMessage, socket: Duplex) {
  if (!request.url?.startsWith("/api/live")) {
    socket.destroy();
    return;
  }

  const key = request.headers["sec-websocket-key"];

  if (typeof key !== "string") {
    socket.destroy();
    return;
  }

  const accept = createHash("sha1").update(`${key}${websocketGuid}`).digest("base64");
  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "",
      "",
    ].join("\r\n")
  );

  clients.add(socket);
  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
}

export function broadcastLiveEvent(event: unknown) {
  const payload = JSON.stringify(event);
  const frame = createTextFrame(payload);

  for (const client of clients) {
    if (client.destroyed) {
      clients.delete(client);
      continue;
    }

    client.write(frame);
  }
}

function createTextFrame(payload: string) {
  const data = Buffer.from(payload);
  const header =
    data.length < 126
      ? Buffer.from([0x81, data.length])
      : data.length <= 0xffff
        ? createUInt16Header(data.length)
        : createUInt64Header(data.length);

  return Buffer.concat([header, data]);
}

function createUInt16Header(length: number) {
  const header = Buffer.alloc(4);
  header[0] = 0x81;
  header[1] = 126;
  header.writeUInt16BE(length, 2);

  return header;
}

function createUInt64Header(length: number) {
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(length), 2);

  return header;
}
