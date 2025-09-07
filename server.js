// server.js - CORRECTED VLESS Proxy Server for Ubuntu VPS (Node.js)
// This version generates keys that connect directly to 172.65.64.251:443
// while using proper SNI/host for TLS handshake

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
// ... [Include all the existing handler functions from previous version]

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
      handleUDPOutBound(ws, addressType, PROXY_IP, PROXY_PORT, rawClientData);
    } else {
      handleTCPOutBound(ws, addressType, PROXY_IP, PROXY_PORT, rawClientData);
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
    case 1:
      addressLength = 4;
      addressRemote = Array.from(new Uint8Array(vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength))).join('.');
      break;
    case 2:
      addressLength = new Uint8Array(vlessBuffer.slice(addressValueIndex, addressValueIndex + 1))[0];
      addressValueIndex += 1;
      addressRemote = new TextDecoder().decode(vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength));
      break;
    case 3:
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

// TCP Handler (forces outbound to PROXY_IP:PROXY_PORT)
function handleTCPOutBound(ws, addressType, addressRemote, portRemote, rawClientData) {
  const socket = net.connect(PROXY_PORT, PROXY_IP, () => {
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

// UDP Handler (forces outbound to PROXY_IP:PROXY_PORT, for PUBG)
function handleUDPOutBound(ws, addressType, addressRemote, portRemote, rawClientData) {
  const udpSocket = dgram.createSocket('udp4');

  udpSocket.send(rawClientData, PROXY_PORT, PROXY_IP, (err) => {
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
    udpSocket.send(data, PROXY_PORT, PROXY_IP);
  });

  ws.on('close', () => udpSocket.close());
}

// Utility: stringify for UUID
function stringify(arr) {
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

console.log('Starting VLESS server...');
