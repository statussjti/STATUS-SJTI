const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const XLSX = require('xlsx');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// ==========================================
// 1. CONFIGURACIÓN DE FIREBASE ADMIN
// ==========================================
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (error) {
        console.error("❌ Error al parsear FIREBASE_SERVICE_ACCOUNT:", error);
    }
} else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
    } catch (error) {
        console.warn("⚠️ No se encontró serviceAccountKey.json local.");
    }
}

let db = null;
try {
    if (serviceAccount) {
        initializeApp({ credential: cert(serviceAccount) });
        db = getFirestore();
        console.log("🔥 Firebase Admin inicializado correctamente.");
    }
} catch (error) {
    console.error("❌ Error al inicializar Firebase Admin:", error);
}

// Ruta Raíz
app.get('/', (req, res) => {
    res.send('¡Servidor de LOGISTATUS PRO en línea y operativo! 🚀');
});

// Ruta de configuración dinámica para el frontend
app.get('/api/config', (req, res) => {
    res.json({
        firebaseApiKey: process.env.FIREBASE_API_KEY || '',
        firebaseProjectId: process.env.FIREBASE_PROJECT_ID || '',
        telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
        telegramChatId: process.env.TELEGRAM_CHAT_ID || ''
    });
});

// Ruta para notificaciones operativas
app.post('/api/notificar', async (req, res) => {
    try {
        const { mensaje } = req.body;
        console.log("📢 Alerta recibida:", mensaje);
        res.json({ success: true, message: "Alerta procesada con éxito." });
    } catch (error) {
        console.error("❌ Error en /api/notificar:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Ruta para envío de correos unificados mediante Resend
app.post('/api/enviar-excel-unificado', async (req, res) => {
    try {
        const { destinatario, asunto, mensaje, excelBase64, nombreArchivo } = req.body;
        const resendApiKey = process.env.RESEND_API_KEY;

        if (!resendApiKey) {
            return res.status(400).json({ success: false, error: 'Falta configurar RESEND_API_KEY en el entorno.' });
        }

        const base64Data = excelBase64.split(';base64,').pop();
        
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'Logistatus Pro <onboarding@resend.dev>',
                to: destinatario,
                subject: asunto,
                html: `<p>${mensaje}</p>`,
                attachments: [
                    {
                        filename: nombreArchivo,
                        content: base64Data
                    }
                ]
            })
        });

        const data = await response.json();
        if (response.ok) {
            res.json({ success: true, data });
        } else {
            res.status(400).json({ success: false, error: data.message || 'Error al enviar correo' });
        }
    } catch (error) {
        console.error("Error crítico en servidor:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 LOGISTATUS PRO corriendo en el puerto ${PORT}`);
});