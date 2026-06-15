import { createServer } from "node:http";

const port = Number(process.env.PORT) || 3000;

const server = createServer((_, response) => {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(
    JSON.stringify({
      ok: true,
      service: "server",
      message: "Stub server is running."
    })
  );
});

server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
