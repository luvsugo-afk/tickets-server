const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const sgMail = require('@sendgrid/mail');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar SendGrid
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-api-key');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json());

// Conectar a Supabase
const supabase = createClient(
    'https://icyxaputskgxannjmtqv.supabase.co',
    process.env.SUPABASE_KEY
);

// Notificación Telegram
const enviarNotificacionTelegram = async (ticket) => {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
    
    const emojis = { 'Critica': '🔴', 'Alta': '🟠', 'Media': '🟡', 'Baja': '🟢' };
    
    let detallesExtra = '';
    if (ticket.detalles_extra && ticket.detalles_extra.trim()) {
        detallesExtra = `\n\n📝 *Detalles adicionales:*\n${ticket.detalles_extra.substring(0, 200)}${ticket.detalles_extra.length > 200 ? '...' : ''}`;
    }
    
    const mensaje = `${emojis[ticket.prioridad] || '🔵'} *NUEVO TICKET #${ticket.id}*\n\n📋 *${ticket.titulo}*\n👤 ${ticket.solicitante}\n✉️ ${ticket.email}\n⚡ Prioridad: ${ticket.prioridad}${detallesExtra}\n\n🔗 Panel: https://tickets-web-ruddy.vercel.app/admin.html`;
    
    try {
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: process.env.TELEGRAM_CHAT_ID,
                text: mensaje,
                parse_mode: 'Markdown'
            })
        });
        console.log('✅ Notificación Telegram enviada');
    } catch (err) {
        console.log('Error Telegram:', err.message);
    }
};

// Auth IT
const authIT = (req, res, next) => {
    const token = req.headers['x-api-key'];
    if (!process.env.IT_API_KEY) return res.status(500).json({ error: 'IT_API_KEY no configurado' });
    if (token !== process.env.IT_API_KEY) return res.status(401).json({ error: 'No autorizado' });
    next();
};

// ============================================
// RUTAS PÚBLICAS
// ============================================

app.get('/', (req, res) => res.send('✅ Servidor funcionando'));

app.post('/api/tickets', async (req, res) => {
    try {
        const { titulo, descripcion, solicitante, email, prioridad, detalles_extra } = req.body;
        
        const { data, error } = await supabase
            .from('tickets')
            .insert([{ 
                titulo, descripcion, solicitante, email, 
                prioridad: prioridad || 'Media', 
                estado: 'Abierto',
                detalles_extra: detalles_extra || null
            }])
            .select();
        
        if (error) throw error;

        await enviarNotificacionTelegram(data[0]);

        if (process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM) {
            const colores = { 'Critica': '#ef4444', 'Alta': '#f97316', 'Media': '#eab308', 'Baja': '#22c55e' };
            const mensajes = {
                'Critica': 'Un técnico se comunicará contigo en los próximos 15 minutos.',
                'Alta': 'Estimamos atender tu solicitud hoy mismo.',
                'Media': 'Tu ticket será atendido en las próximas 24-48 horas.',
                'Baja': 'Trabajaremos en tu solicitud tan pronto como sea posible.'
            };

            const msg = {
                to: email,
                from: process.env.EMAIL_FROM,
                subject: `Ticket #${data[0].id} recibido - Estamos en ello`,
                html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><div style="background: #f3f0ff; border-radius: 16px; padding: 40px; text-align: center;"><div style="font-size: 48px; margin-bottom: 20px;">💜</div><h1 style="color: #7c3aed; margin: 0;">¡Hola, ${solicitante}!</h1><p style="color: #6b7280; font-size: 16px; margin-top: 16px;">Hemos recibido tu solicitud y ya está siendo atendida.</p></div><div style="background: white; border-radius: 12px; padding: 24px; margin-top: 20px; border-left: 4px solid ${colores[prioridad]};"><h3 style="margin-top: 0; color: #374151; font-size: 14px;">Detalles de tu ticket</h3><p style="margin: 8px 0; color: #4b5563;"><strong>Número:</strong> #${data[0].id}</p><p style="margin: 8px 0; color: #4b5563;"><strong>Problema:</strong> ${titulo}</p><p style="margin: 8px 0; color: #4b5563;"><strong>Prioridad:</strong> <span style="background: ${colores[prioridad]}20; color: ${colores[prioridad]}; padding: 4px 12px; border-radius: 20px; font-weight: bold;">${prioridad}</span></p></div><div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin-top: 20px;"><p style="margin: 0; color: #6b7280; font-size: 14px;"><strong>¿Qué sigue?</strong><br>${mensajes[prioridad]}</p></div><div style="text-align: center; margin-top: 30px; color: #9ca3af; font-size: 12px;">Este es un correo automático del sistema de tickets.<br>Equipo de IT</div></div>`
            };
            sgMail.send(msg).catch(err => console.log('Error email:', err.message));
        }

        res.json({ exito: true, ticket: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// RUTAS PRIVADAS (IT)
// ============================================

app.get('/api/admin/tickets', authIT, async (req, res) => {
    try {
        const { data, error } = await supabase.from('tickets').select('*').order('fecha_creacion', { ascending: false });
        if (error) throw error;
        
        const orden = { 'Critica': 1, 'Alta': 2, 'Media': 3, 'Baja': 4 };
        data.sort((a, b) => orden[a.prioridad] - orden[b.prioridad] || new Date(b.fecha_creacion) - new Date(a.fecha_creacion));
        
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/tickets/:id', authIT, async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        
        const { data: ticketData } = await supabase.from('tickets').select('email, solicitante, titulo').eq('id', id).single();
        await supabase.from('tickets').update({ estado }).eq('id', id);
        
        if (estado === 'Cerrado' && ticketData?.email && process.env.SENDGRID_API_KEY) {
            const msg = {
                to: ticketData.email,
                from: process.env.EMAIL_FROM,
                subject: `✅ Ticket #${id} resuelto`,
                html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><div style="background: #dcfce7; border-radius: 16px; padding: 40px; text-align: center; border: 2px solid #22c55e;"><div style="font-size: 48px; margin-bottom: 20px;">✅</div><h1 style="color: #166534; margin: 0;">¡Tu ticket ha sido resuelto!</h1><p style="color: #15803d; font-size: 16px; margin-top: 16px;">Hola ${ticketData.solicitante}, hemos atendido tu solicitud.</p></div><div style="background: white; border-radius: 12px; padding: 24px; margin-top: 20px; border-left: 4px solid #22c55e;"><h3 style="margin-top: 0; color: #374151; font-size: 14px;">Detalles del ticket resuelto</h3><p style="margin: 8px 0; color: #4b5563;"><strong>Número:</strong> #${id}</p><p style="margin: 8px 0; color: #4b5563;"><strong>Problema:</strong> ${ticketData.titulo}</p><p style="margin: 8px 0; color: #4b5563;"><strong>Estado:</strong> <span style="background: #dcfce7; color: #166534; padding: 4px 12px; border-radius: 20px; font-weight: bold;">RESUELTO</span></p></div><div style="text-align: center; margin-top: 30px; color: #9ca3af; font-size: 12px;">Este es un correo automático del sistema de tickets.<br>Equipo de IT 💜</div></div>`
            };
            sgMail.send(msg).catch(err => console.log('Error:', err.message));
        }
        
        res.json({ exito: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/tickets/:id', authIT, async (req, res) => {
    try {
        await supabase.from('tickets').delete().eq('id', req.params.id);
        res.json({ exito: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log('Servidor en puerto', PORT));
