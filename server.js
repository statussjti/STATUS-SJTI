require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const { Resend } = require('resend');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Servir archivos estáticos desde la misma carpeta del proyecto
app.use(express.static(__dirname));

// --- INICIALIZACIÓN DIRECTA DE FIREBASE ---
let db = null;
try {
    const serviceAccount = require('./sjti-70001-firebase-adminsdk-fbsvc-67d2fe1b35.json');
    
    if (serviceAccount && serviceAccount.project_id) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
        console.log("✅ Firebase Admin inicializado correctamente con la base de datos.");
    } else {
        console.error("❌ El archivo JSON de Firebase está vacío o no tiene el formato correcto.");
    }
} catch (error) {
    console.error("❌ Error al inicializar Firebase Admin:", error.message);
}

// Inicializar Resend de forma segura (evita que falle si falta la variable de entorno)
let resend = null;
if (process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log("✅ Resend inicializado correctamente.");
} else {
    console.warn("⚠️ Resend API Key no configurada, servicio de correo deshabilitado.");
}

// --- RUTAS BÁSICAS DE CONFIGURACIÓN ---
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        projectId: process.env.FIREBASE_PROJECT_ID || "sjti-70001",
        cloudConnected: db !== null
    });
});

// --- ENDPOINT DE AUTENTICACIÓN (LOGIN) ---
app.post('/api/login', async (req, res) => {
    try {
        const { usuario, password } = req.body;
        
        if (!usuario || !password) {
            return res.status(400).json({ success: false, error: "Usuario y contraseña requeridos" });
        }

        let usuarioEncontrado = null;
        const usuarioTrim = usuario.trim().toLowerCase();

        if (db) {
            const snapshot = await db.collection('usuarios').get();
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.usuario && data.usuario.trim().toLowerCase() === usuarioTrim && data.password === password) {
                    usuarioEncontrado = { id: doc.id, ...data };
                }
            });
        }

        if (!usuarioEncontrado) {
            if (usuarioTrim === 'admin' && password === 'admin') {
                usuarioEncontrado = { usuario: 'admin', nombre: 'Administrador Principal', rol: 'Administrador' };
            }
        }

        if (usuarioEncontrado) {
            return res.json({ success: true, user: usuarioEncontrado, message: "Acceso concedido" });
        } else {
            return res.status(401).json({ success: false, error: "Usuario o contraseña incorrectos" });
        }

    } catch (error) {
        console.error("Error crítico en el login:", error);
        res.status(500).json({ success: false, error: "Error en el servidor al autenticar" });
    }
});

// --- ENDPOINTS DE GESTIÓN DE USUARIOS ---

app.get('/api/usuarios', async (req, res) => {
    try {
        let usuarios = [];
        
        if (db) {
            const snapshot = await db.collection('usuarios').get();
            snapshot.forEach(doc => {
                usuarios.push({ id: doc.id, ...doc.data() });
            });
        }
        
        if (usuarios.length === 0) {
            usuarios.push({ 
                id: 'local-admin-1', 
                usuario: 'admin', 
                nombre: 'Administrador Principal', 
                rol: 'Administrador' 
            });
        }

        return res.json(usuarios);
    } catch (error) {
        console.error("Error al obtener usuarios:", error);
        res.status(500).json({ error: "Error al obtener la lista de usuarios" });
    }
});

app.post('/api/usuarios', async (req, res) => {
    try {
        const { usuario, password, nombre, rol } = req.body;
        
        if (!usuario || !password) {
            return res.status(400).json({ error: "El usuario y la contraseña son obligatorios" });
        }

        if (db) {
            const nuevoUsuario = { 
                usuario: usuario.trim(), 
                password, 
                nombre: nombre || usuario, 
                rol: rol || 'Operador', 
                createdAt: new Date().toISOString() 
            };
            const docRef = await db.collection('usuarios').add(nuevoUsuario);
            return res.json({ success: true, id: docRef.id, message: "Usuario guardado exitosamente en Firebase" });
        } else {
            return res.status(500).json({ success: false, error: "Base de datos no conectada" });
        }
    } catch (error) {
        console.error("Error al guardar usuario:", error);
        res.status(500).json({ error: "Error al registrar el usuario en la base de datos" });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 LOGISTATUS PRO corriendo en el puerto ${PORT}`);
});