const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Conectar a Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

app.use(cors());
app.use(express.json());

// Prioridades automáticas
const prioridadAutomatica = {
    'sin-internet': 'Critica',
    'password-bloqueada': 'Critica',
    'vpn-caida': 'Critica',
    'pc-no-enciende': 'Alta',
    'pantalla-azul': 'Alta',
    'monitor-negro': 'Alta',
    'no-envia': 'Alta',
    'no-recibe': 'Alta',
    'outlook-no-abre': 'Alta',
    'antivirus-vencido': 'Alta',
    'impresora-oficina': 'Alta',
    'bloquear-exempleado': 'Alta',
    'office-crash': 'Media',
    'app-externa': 'Media',
    'wifi-lento': 'Media',
    'compartir-archivos': 'Media',
    'escaner-falla': 'Media',
    'toner-agotado': 'Media',
    'reset-password': 'Media',
    'acceso-carpeta': 'Media',
    'crear-usuario': 'Media',
    'recuperar-borrado': 'Media',
    'sobrecalentamiento': 'Media',
    'actualizacion-pendiente': 'Baja',
    'teclado-danado': 'Baja',
    'mouse-falla': 'Baja',
    'navegador-lento': 'Baja',
    'configurar-firma': 'Baja',
    'instalar-impresora': 'Baja',
    'consulta-general': 'Baja',
    'compra-equipo': 'Baja'
};

// Función para enviar email
function enviarEmail(to, subject, htmlContent) {
    const data = JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: process.env.EMAIL_FROM || 'soporte@empresa.com' },
        subject: subject,
        content: [{ type: 'text/html', value: htmlContent }]
    });

    const options = {
        hostname: 'api.sendgrid.com',
        path: '/v3/mail/send',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            if (res.statusCode === 202) resolve();
            else reject(new Error(`Status: ${res.statusCode}`));
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// ============================================
// ENDPOINT PÚBLICO: Crear ticket
// ============================================

app.post('/api/tickets', async (req, res) => {
    try {
        const { 
            categoria, 
            problema, 
            titulo_problema,
            descripcion_problema,
            solicitante, 
            email,
            detalles_extra 
        } = req.body;
        
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Email válido requerido' });
        }
        
        if (!solicitante || !problema) {
            return res.status(400).json({ error: 'Faltan datos' });
        }

        const prioridad = prioridadAutomatica[problema] || 'Media';
        
        let descripcionCompleta = `Categoría: ${categoria}\n`;
        descripcionCompleta += `Problema: ${titulo_problema}\n\n`;
        descripcionCompleta += `${descripcion_problema}`;
        
        if (detalles_extra && detalles_extra.trim()) {
            descripcionCompleta += `\n\nInformación adicional:\n${detalles_extra}`;
        }

        const { data, error } = await supabase
            .from('tickets')
            .insert([{ 
                titulo: titulo_problema,
                descripcion: descripcionCompleta,
                solicitante: solicitante,
                email: email,
                prioridad: prioridad,
                estado: 'Abierto',
                categoria: categoria,
                tipo_problema: problema
            }])
            .select();
        
        if (error) throw error;

        // Enviar email
        const colores = {
            'Critica': '#ef4444',
            'Alta': '#f97316',
            'Media': '#eab308',
            'Baja': '#22c55e'
        };
        
        const mensajes = {
            'Critica': 'Un técnico se comunicará contigo en los próximos 15 minutos.',
            'Alta': 'Estimamos atender tu solicitud hoy mismo.',
            'Media': 'Tu ticket será atendido en las próximas 24-48 horas.',
            'Baja': 'Trabajaremos en tu solicitud tan pronto como sea posible.'
        };

        const htmlEmail = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: #f3f0ff; border-radius: 16px; padding: 40px; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 20px;">💜</div>
                    <h1 style="color: #7c3aed; margin: 0;">¡Hola, ${solicitante}!</h1>
                    <p style="color: #6b7280; font-size: 16px; margin-top: 16px;">
                        Hemos recibido tu solicitud y ya está siendo atendida.
                    </p>
                </div>
                
                <div style="background: white; border-radius: 12px; padding: 24px; margin-top: 20px; border-left: 4px solid ${colores[prioridad]};">
                    <h3 style="margin-top: 0; color: #374151; font-size: 14px;">Detalles de tu ticket</h3>
                    <p style="margin: 8px 0; color: #4b5563;"><strong>Número:</strong> #${data[0].id}</p>
                    <p style="margin: 8px 0; color: #4b5563;"><strong>Problema:</strong> ${titulo_problema}</p>
                    <p style="margin: 8px 0; color: #4b5563;">
                        <strong>Prioridad:</strong> 
                        <span style="background: ${colores[prioridad]}20; color: ${colores[prioridad]}; padding: 4px 12px; border-radius: 20px; font-weight: bold;">${prioridad}</span>
                    </p>
                </div>
                
                <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin-top: 20px;">
                    <p style="margin: 0; color: #6b7280; font-size: 14px;">
                        <strong>¿Qué sigue?</strong><br>
                        ${mensajes[prioridad]}
                    </p>
                </div>
                
                <div style="text-align: center; margin-top: 30px; color: #9ca3af; font-size: 12px;">
                    Este es un correo automático del sistema de tickets.<br>
                    Equipo de IT
                </div>
            </div>
        `;

        enviarEmail(email, `Ticket #${data[0].id} recibido`, htmlEmail)
            .catch(err => console.log('Error enviando email:', err.message));

        res.json({ 
            exito: true, 
            ticket: data[0],
            mensaje: 'Ticket creado'
        });
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// ENDPOINTS PRIVADOS (IT)
// ============================================

const authIT = (req, res, next) => {
    const token = req.headers['x-api-key'];
    if (token !== process.env.IT_API_KEY) {
        return res.status(401).json({ error: 'No autorizado' });
    }
    next();
};

app.get('/api/admin/tickets', authIT, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('tickets')
            .select('*')
            .order('fecha_creacion', { ascending: false });
        
        if (error) throw error;
        
        const orden = { 'Critica': 1, 'Alta': 2, 'Media': 3, 'Baja': 4 };
        data.sort((a, b) => {
            if (orden[a.prioridad] !== orden[b.prioridad]) {
                return orden[a.prioridad] - orden[b.prioridad];
            }
            return new Date(b.fecha_creacion) - new Date(a.fecha_creacion);
        });
        
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/tickets/:id', authIT, async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        
        const { error } = await supabase
            .from('tickets')
            .update({ estado })
            .eq('id', id);
        
        if (error) throw error;
        res.json({ exito: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/tickets/:id', authIT, async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('tickets').delete().eq('id', id);
        if (error) throw error;
        res.json({ exito: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/', (req, res) => {
    res.send('🌸 Servidor de tickets funcionando');
});

app.listen(PORT, () => {
    console.log('Servidor corriendo en puerto', PORT);
});
