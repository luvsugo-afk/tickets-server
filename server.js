const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const sgMail = require('@sendgrid/mail');

const app = express();
const PORT = process.env.PORT || 3000;

if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-api-key');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json());

const supabase = createClient(
    'https://icyxaputskgxannjmtqv.supabase.co',
    process.env.SUPABASE_KEY
);

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
    } catch (err) {
        console.log('Error Telegram:', err.message);
    }
};

const authIT = (req, res, next) => {
    const token = req.headers['x-api-key'];
    if (!process.env.IT_API_KEY) return res.status(500).json({ error: 'IT_API_KEY no configurado' });
    if (token !== process.env.IT_API_KEY) return res.status(401).json({ error: 'No autorizado' });
    next();
};

app.get('/', (req, res) => res.send('Servidor funcionando'));

app.post('/api/tickets', async (req, res) => {
    try {
        const { titulo, descripcion, solicitante, email, prioridad, detalles_extra } = req.body;
        
        const tiemposRespuesta = {
            'Critica': '15 minutos',
            'Alta': '24 horas',
            'Media': '48 horas',
            'Baja': '72 horas'
        };
        
        const { data, error } = await supabase
            .from('tickets')
            .insert([{ 
                titulo, 
                descripcion, 
                solicitante, 
                email,
                prioridad: prioridad || 'Media',
                estado: 'Abierto',
                detalles_extra: detalles_extra || null
            }])
            .select();
        
        if (error) throw error;

        await enviarNotificacionTelegram(data[0]);

        if (process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM) {
            const msg = {
                to: email,
                from: process.env.EMAIL_FROM,
                subject: `Solicitud #${data[0].id} recibida - ${titulo}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.6;">
                        <h2 style="color: #2d4a3e; border-bottom: 2px solid #4a7c59; padding-bottom: 10px;">Confirmación de solicitud</h2>
                        
                        <p>Estimado/a ${solicitante},</p>
                        
                        <p>Hemos recibido su solicitud de soporte técnico. A continuación los detalles:</p>
                        
                        <div style="background: #f5f4f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4a7c59;">
                            <p><strong>Número de ticket:</strong> #${data[0].id}</p>
                            <p><strong>Asunto:</strong> ${titulo}</p>
                            <p><strong>Clasificación:</strong> ${prioridad}</p>
                            <p><strong>Tiempo estimado de respuesta:</strong> ${tiemposRespuesta[prioridad]}</p>
                        </div>
                        
                        <p>Su solicitud será atendida en el plazo indicado.</p>
                        
                        <p>Para consultas o dudas sobre el estado de su ticket, comuníquese al 1157211393.</p>
                        
                        <p>Atentamente,<br>Departamento de Soporte Técnico</p>
                        
                        <hr style="border: none; border-top: 1px solid #ddd; margin-top: 30px;">
                        <p style="font-size: 12px; color: #666;">Este es un mensaje automático. Por favor no responda a este correo.</p>
                    </div>
                `
            };

            sgMail.send(msg).catch(err => console.log('Error email:', err.message));
        }

        res.json({ exito: true, ticket: data[0] });
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
            const msgResuelto = {
                to: ticketData.email,
                from: process.env.EMAIL_FROM,
                subject: `Solicitud #${id} resuelta`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.6;">
                        <h2 style="color: #2d4a3e; border-bottom: 2px solid #4a7c59; padding-bottom: 10px;">Solicitud finalizada</h2>
                        
                        <p>Estimado/a ${ticketData.solicitante},</p>
                        
                        <p>Le informamos que su solicitud ha sido atendida y resuelta.</p>
                        
                        <div style="background: #f5f4f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4a7c59;">
                            <p><strong>Número de ticket:</strong> #${id}</p>
                            <p><strong>Asunto:</strong> ${ticketData.titulo}</p>
                            <p><strong>Estado:</strong> RESUELTO</p>
                            <p><strong>Fecha de cierre:</strong> ${new Date().toLocaleString()}</p>
                        </div>
                        
                        <p>Si considera que el problema persiste o necesita asistencia adicional, puede generar una nueva solicitud.</p>
                        
                        <p>Atentamente,<br>Ailen.</p>
                        
                        <hr style="border: none; border-top: 1px solid #ddd; margin-top: 30px;">
                        <p style="font-size: 12px; color: #666;">Este es un mensaje automático. Por favor no responda a este correo.</p>
                    </div>
                `
            };

            sgMail.send(msgResuelto).catch(err => console.log('Error:', err.message));
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
