// server.js - Complete VLESS Proxy Server for Ubuntu VPS (Node.js)
// This adapts your Cloudflare script for VPS with TCP/UDP support for PUBG.
// Automatically generates and displays VLESS key on startup and via HTTP at /generate-key.
// Set your UUID and proxyIP below.
// Install: npm install ws
// Run: node server.js
// Access http://your-vps-ip:80/generate-key to get VLESS URI.
// For TLS: Set up Nginx + Let's Encrypt, change port to 443.

const http = require('http');
const WebSocket = require('ws');
const net = require('net');
const dgram = require('dgram');
const crypto = require('crypto');
const url = require('url');

// Configuration - Set your values here
const USER_ID = 'a10d76fd-25ec-4d5a-bdf1-6593a73e2e16'; // Your UUID
const PROXY_IP = '172.65.64.251'; // Target IP for proxying
const PORT = 80; // Change to 443 after TLS setup
const PATH = '/?ed=2560'; // WS path
const HOST = 'act.actanimemm.webredirect.org'; // Your domain for SNI/host

// Other variables from your script (adapt as needed)
let go2Socks5s = ['*.pubg.com', '*.krafton.com']; // For PUBG UDP routing
let enableSocks = false; // Set true if using SOCKS5
let socks5Address = ''; // e.g., 'user:pass@server:1080'

// Server setup
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  if (parsedUrl.pathname === '/generate-key') {
    const vlessKey = generateVlessKey(USER_ID, PROXY_IP, PORT, HOST, PATH);
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

server.listen(PORT, () => {
  console.log(`VLESS server running on port ${PORT}`);
  const vlessKey = generateVlessKey(USER_ID, PROXY_IP, PORT, HOST, PATH);
  console.log('\nGenerated VLESS Key (copy this):\n' + vlessKey);
  console.log('\nFor TLS, configure Nginx and change PORT to 443.');
});

// Function to generate VLESS URI (key)
function generateVlessKey(uuid, host, port, sni, path) {
  return `vless://${uuid}@${host}:${port}?encryption=none&security=tls&type=ws&host=${sni}&sni=${sni}&path=${path}&headerType=ws&headers=eyJIb3N0IjogImFjdC5hY3RhbmltZW1tLndlYnJlZGlyZWN0Lm9yZyJ9#VLESS-act`;
}

// Your vlessOverWSHandler (adapted)
function vlessOverWSHandler(ws, req) {
  ws.on('message', (chunk) => {
    const { hasError, addressType, portRemote, addressRemote, rawDataIndex, isUDP } = processVlessHeader(chunk, USER_ID);

    if (hasError) {
      ws.close();
      return;
    }

    const rawClientData = chunk.slice(rawDataIndex);

    if (isUDP) {
      handleUDPOutBound(ws, addressType, addressRemote, portRemote, rawClientData);
    } else {
      handleTCPOutBound(ws, addressType, addressRemote, portRemote, rawClientData);
    }
  });

  ws.on('close', () => console.log('WebSocket closed'));
}

// Adapted processVlessHeader (simplified from your script)
function processVlessHeader(vlessBuffer, userID) {
  if (vlessBuffer.byteLength < 24) return { hasError: true };

  const version = new Uint8Array(vlessBuffer.slice(0, 1));
  const uuidBytes = vlessBuffer.slice(1, 17);
  const receivedUUID = stringify(uuidBytes);

  if (receivedUUID !== userID) return { hasError: true };

  const optLength = new Uint8Array(vlessBuffer.slice(17, 18))[0];
  const command = new Uint8Array(vlessBuffer.slice(18 + optLength, 19 + optLength))[0];
  const isUDP = command === 2;

  const portIndex = 19 + optLength;
  const portRemote = new DataView(vlessBuffer.slice(portIndex, portIndex + 2)).getUint16(0);

  let addressIndex = portIndex + 2;
  const addressType = new Uint8Array(vlessBuffer.slice(addressIndex, addressIndex + 1))[0];
  let addressLength = 0;
  let addressValueIndex = addressIndex + 1;
  let addressRemote = '';

  switch (addressType) {
    case 1: // IPv4
      addressLength = 4;
      addressRemote = Array.from(new Uint8Array(vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength))).join('.');
      break;
    case 2: // Domain
      addressLength = new Uint8Array(vlessBuffer.slice(addressValueIndex, addressValueIndex + 1))[0];
      addressValueIndex += 1;
      addressRemote = new TextDecoder().decode(vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength));
      break;
    case 3: // IPv6
      addressLength = 16;
      addressRemote = '[' + Array.from(new Uint16Array(vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength))).map(x => x.toString(16)).join(':') + ']';
      break;
    default:
      return { hasError: true };
  }

  return {
    hasError: false,
    addressType,
    addressRemote,
    portRemote,
    rawDataIndex: addressValueIndex + addressLength,
    isUDP
  };
}

// TCP Handler
function handleTCPOutBound(ws, addressType, addressRemote, portRemote, rawClientData) {
  const socket = net.connect(portRemote, addressRemote, () => {
    socket.write(rawClientData);
  });

  socket.on('data', (data) => ws.send(data));
  socket.on('end', () => ws.close());
  socket.on('error', (err) => {
    console.error('TCP error:', err);
    ws.close();
  });

  ws.on('message', (data) => socket.write(data));
  ws.on('close', () => socket.end());
}

// UDP Handler (for PUBG)
function handleUDPOutBound(ws, addressType, addressRemote, portRemote, rawClientData) {
  const udpSocket = dgram.createSocket('udp4');

  udpSocket.send(rawClientData, portRemote, addressRemote, (err) => {
    if (err) console.error('UDP send error:', err);
  });

  udpSocket.on('message', (msg) => {
    ws.send(msg);
  });

  udpSocket.on('error', (err) => {
    console.error('UDP error:', err);
    ws.close();
  });

  ws.on('message', (data) => {
    udpSocket.send(data, portRemote, addressRemote);
  });

  ws.on('close', () => udpSocket.close());
}

// Utility: stringify for UUID (from your script)
function stringify(arr) {
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Add your other functions if needed (e.g., 双重哈希, etc.)

console.log('Starting VLESS server...');
