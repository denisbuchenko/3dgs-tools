import { createServer } from "node:http";
import { handleApi, handleApiError } from "./api.js";
import { ensureGsplatEnvironment } from "./gaussian-splat/index.js";
import { handleWebSocketUpgrade } from "./realtime/websocket.js";

const port = Number(process.env.PORT) || 3000;

const server = createServer((request, response) => {
  handleApi(request, response).catch((error: unknown) => {
    handleApiError(response, error);
  });
});

server.on("upgrade", (request, socket) => {
  handleWebSocketUpgrade(request, socket);
});

server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
  ensureGsplatEnvironment().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Failed to prepare Gaussian Splatting.";
    console.error(message);
  });
});
