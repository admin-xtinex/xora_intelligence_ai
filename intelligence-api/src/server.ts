import { createServer } from "node:http";
import { handleAnalyze, handleHealth, handleMeta } from "./http.ts";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  let response: Response;
  try {
    if (req.method === "GET" && url.pathname === "/health") response = handleHealth();
    else if (req.method === "GET" && url.pathname === "/v1/meta") response = handleMeta();
    else if (req.method === "POST" && url.pathname === "/v1/analyze") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const request = new Request(url, {
        method: "POST",
        headers: { "content-type": req.headers["content-type"] ?? "application/json" },
        body: Buffer.concat(chunks),
      });
      response = await handleAnalyze(request);
    } else response = new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  } catch (error) {
    console.error(error);
    response = new Response(JSON.stringify({ error: "internal error" }), { status: 500 });
  }
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(port, host, () => {
  console.log(`intelligence api listening on ${host}:${port}`);
});
