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

// --- INICIALIZACIÓN AUTOMÁTICA DE FIREBASE (LOCAL Y NUBE) ---
let db = null;
try {
    let serviceAccount = null;

    // 1. Si estamos en Render o hay variable de entorno con el JSON
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log("🔓 Usando credenciales de Firebase desde Variable de Entorno.");
    } else {
        // 2. Búsqueda automática del archivo JSON de Firebase en la carpeta local
        const files = fs.readdirSync(__dirname);
        const serviceAccountFile = files.find(file => file.endsWith('.json') && (file.includes('firebase') || file.includes('adminsdk')));

        if (serviceAccountFile) {
            serviceAccount = require(path.join(__dirname, serviceAccountFile));
            console.log(`📁 Usando credenciales locales de Firebase: ${serviceAccountFile}`);
        }
    }

    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
        console.log("✅ Firebase Admin inicializado exitosamente. Base de datos conectada.");
    } else {
        console.warn("⚠️ No se encontró credencial de Firebase (ni archivo JSON ni variable de entorno).");
    }
} catch (error) {
    console.error("❌ Error al inicializar Firebase Admin:", error.message);
}

// Inicializar Resend para correos
const resend = new Resend(process.env.RESEND_API_KEY);

// --- RUTAS BÁSICAS DE CONFIGURACIÓN ---
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        projectId: process.env.FIREBASE_PROJECT_ID || "statusylogistica",
        cloudConnected: db !== null
    });
});

// --- ENDPOINT DE AUTENTICACIÓN (LOGIN DIRECTO EN FIREBASE) ---
app.post('/api/login', async (req, res) => {
    try {
        const { usuario, password } = req.body;
        
        if (!usuario || !password) {
            return res.status(400).json({ success: false, error: "Usuario y contraseña requeridos" });
        }

        let usuarioEncontrado = null;
        const usuarioTrim = usuario.trim().toLowerCase();

        if (db) {
            try {
                const snapshot = await db.collection('usuarios').get();
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.usuario && data.usuario.trim().toLowerCase() === usuarioTrim && data.password === password) {
                        usuarioEncontrado = { id: doc.id, ...data };
                    }
                });
            } catch (dbError) {
                console.error("Error al consultar Firestore en login:", dbError.message);
            }
        }

        // Respaldo por defecto si no hay registros o para pruebas directas
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
            try {
                const snapshot = await db.collection('usuarios').get();
                snapshot.forEach(doc => {
                    usuarios.push({ id: doc.id, ...doc.data() });
                });
            } catch (dbError) {
                console.error("Error al obtener usuarios de Firestore:", dbError.message);
            }
        }
        
        // Si la tabla está vacía, mostrar por defecto el admin local para referencia
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