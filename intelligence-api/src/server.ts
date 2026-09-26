import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { handleAnalyze, handleHealth, handleMeta } from "./http.ts";
import { loadMarket, MarketError } from "./market.ts";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
const deskPath = fileURLToPath(new URL("../public/index.html", import.meta.url));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  let response: Response;
  try {
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      response = new Response(readFileSync(deskPath, "utf8"), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    } else if (req.method === "GET" && url.pathname === "/health") response = handleHealth();
    else if (req.method === "GET" && url.pathname === "/v1/meta") response = handleMeta();
    else if (req.method === "GET" && url.pathname === "/v1/market") {
      try {
        response = json(await loadMarket(url.searchParams.get("symbol") ?? ""));
      } catch (error) {
        if (error instanceof MarketError) response = json({ error: error.message }, 404);
        else throw error;
      }
    } else if (req.method === "POST" && url.pathname === "/v1/analyze") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const request = new Request(url, {
        method: "POST",
        headers: { "content-type": req.headers["content-type"] ?? "application/json" },
        body: Buffer.concat(chunks),
      });
      response = await handleAnalyze(request);
    } else response = json({ error: "not found" }, 404);
  } catch (error) {
    console.error(error);
    response = json({ error: "internal error" }, 500);
  }
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(port, host, () => {
  console.log(`intelligence api listening on ${host}:${port}`);
});
