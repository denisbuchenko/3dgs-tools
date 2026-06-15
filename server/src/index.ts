import { createServer } from "node:http";
import { handleApi, handleApiError } from "./api.js";

const port = Number(process.env.PORT) || 3000;

const server = createServer((request, response) => {
  handleApi(request, response).catch((error: unknown) => {
    handleApiError(response, error);
  });
});

server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
