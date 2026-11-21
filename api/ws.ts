import http from "node:http";
import { WebSocketServer } from "ws";
import { Session } from "./_lib/session";

// Vercel Functions serve WebSockets natively (vercel.com/docs/functions/websockets). A socket closes when the
// function reaches its max duration; the page reconnects and resends its ledger.
const server = http.createServer((_req, res) => {
  res.statusCode = 426;
  res.setHeader("Upgrade", "websocket");
  res.end("WebSocket only");
});
const wss = new WebSocketServer({ server, maxPayload: 256 * 1024 });
wss.on("connection", (ws) => new Session(ws));

export default server;
