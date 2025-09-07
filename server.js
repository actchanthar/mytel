// server.js - CORRECTED VLESS Proxy Server for Ubuntu VPS (Node.js)
// Generates keys that connect directly to 172.65.64.251:443 with proper SNI
// Supports full TCP/UDP for PUBG/internet access.
// Automatically generates and displays VLESS key on startup and via HTTP at /generate-key.
// Set your UUID below.
// Install: npm install ws
// Run: node server.js
// Access https://your-domain/generate-key to get VLESS URI (uses domain for TLS, proxies to IP).

const http = require('http');
const WebSocket = require('ws');
const net = require('net');
const dgram = require('dgram');
const crypto = require('crypto');
const url = require('url');

// Configuration - Set your values here
const USER_ID = 'a10d76fd-25ec-4d5a-bdf1-6593a73e2e16'; // Your UUID
const PROXY_IP = '172.65.64.251'; // Fixed IP to proxy all traffic through
const PROXY_PORT = 443; // Fixed port for proxying
const SERVER_PORT = 3000; // Internal port (Nginx proxies to this; external is 443 via Nginx)
const PATH = '/?ed'; // Simplified WS path
const SNI_HOST = 'act.actanimemm.webredirect.org'; // Working SNI/host

// Other variables from your script (adapt as needed)
let go2Socks5s = ['*.pubg.com', '*.krafton.com', '*.tencent.com']; // For PUBG UDP routing
let enableSocks = false; // Set true if using SOCKS5
let socks5Address = ''; // e.g., 'user:pass@server:1080'

// Server setup
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  if (parsedUrl.pathname === '/generate-key') {
    const vlessKey = generateVlessKey(USER_ID, PROXY_IP, PROXY_PORT, SNI_HOST, PATH);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(vlessKey);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>VLESS Proxy Server Running</h1><p>Visit /generate-key for VLESS URI.</p>');
  }
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  console.log('WebSocket connected');
  vlessOverWSHandler(ws, req);
});

server.listen(SERVER_PORT, () => {
  console.log(`VLESS server running on internal port ${SERVER_PORT}`);
  const vlessKey = generateVlessKey(USER_ID, PROXY_IP, PROXY_PORT, SNI_HOST, PATH);
  console.log('\nGenerated WORKING VLESS Key (connects to ' + PROXY_IP + '):\n' + vlessKey);
});

// Function to generate WORKING VLESS URI - connects directly to IP with proper SNI
function generateVlessKey(uuid, ip, port, sni, path) {
  return `vless://${uuid}@${ip}:${port}?encryption=none&security=tls&sni=${sni}&type=ws&host=${sni}&path=${encodeURIComponent(path)}#VLESS-act`;
}

// Rest of your existing functions (vlessOverWSHandler, processVlessHeader, handleTCPOutBound, handleUDPOutBound, stringify)
// ... [Include all the existing handler functions from previous version here. Copy from your current server.js]

console.log('Starting VLESS server...');
