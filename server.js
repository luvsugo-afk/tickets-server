const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const sgMail = require('@sendgrid/mail');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar SendGrid si existe
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// CORS completo para todos los orígenes y métodos
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-api-key');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());

// Conectar a Supabase
const supabase = createClient(
    'https://icyxaputskgxannjmtqv.supabase.co',
    process.env.SUPABASE_KEY
);

// Middleware de autenticación para IT
const authIT = (req, res, next) => {
    const token = req.headers['x-api-key'];
    
    if (!process.env.IT_API_KEY) {
        return res.status(500).json({ error: 'IT_API_KEY no configurado en servidor' });
    }
    
    if (token !== process.env.IT_API_KEY) {
        return res.status(401).json({ error: 'No autorizado' });
    }
    
    next();
};

// ============================================
// RUTAS PÚBLICAS (para usuarios)
// ============================================

// Health check
app.get('/', (req, res) => {
    res.send('✅ Servidor funcionando');
});

// Crear ticket con email de confirmación
app.post('/api/tickets', async (req, res) => {
    try {
        const { titulo, descripcion, solicitante, email, prioridad } = req.body;
        
        // Guardar en base de datos
        const { data, error } = await supabase
            .from('tickets')
            .insert([{ 
                titulo, 
                descripcion, 
                solicitante, 
                email,
                prioridad: prioridad || 'Media',
                estado: 'Abierto'
            }])
            .select();
        
        if (error) throw error;

        // Enviar email de confirmación
        if (process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM) {
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

            const msg = {
                to: email,
                from: process.env.EMAIL_FROM,
                subject: `Ticket #${data[0].id} recibido - Estamos en ello`,
                html: `
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
                            <p style="margin: 8px 0; color: #4b5563;"><strong>Problema:</strong> ${titulo}</p>
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
                `
            };

            sgMail.send(msg).catch(err => {
                console.log('Error enviando email:', err.message);
            });
        }

        res.json({ exito: true, ticket: data[0] });
        
    } catch (err) {
        console.log('Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// RUTAS PRIVADAS (solo IT)
// ============================================

// Ver todos los tickets
app.get('/api/admin/tickets', authIT, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('tickets')
            .select('*')
            .order('fecha_creacion', { ascending: false });
        
        if (error) throw error;
        
        // Ordenar por prioridad
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

// Cambiar estado + enviar email de resolución
app.put('/api/admin/tickets/:id', authIT, async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        
        // Obtener datos del ticket antes de actualizar
        const { data: ticketData, error: ticketError } = await supabase
            .from('tickets')
            .select('email, solicitante, titulo')
            .eq('id', id)
            .single();
        
        if (ticketError) throw ticketError;
        
        // Actualizar estado
        const { error } = await supabase
            .from('tickets')
            .update({ estado })
            .eq('id', id);
        
        if (error) throw error;
        
        // Enviar email si se resolvió
        if (estado === 'Cerrado' && ticketData.email && process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM) {
            const msg = {
                to: ticketData.email,
                from: process.env.EMAIL_FROM,
                subject: `✅ Ticket #${id} resuelto`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="background: #dcfce7; border-radius: 16px; padding: 40px; text-align: center; border: 2px solid #22c55e;">
                            <div style="font-size: 48px; margin-bottom: 20px;">✅</div>
                            <h1 style="color: #166534; margin: 0;">¡Tu ticket ha sido resuelto!</h1>
                            <p style="color: #15803d; font-size: 16px; margin-top: 16px;">
                                Hola ${ticketData.solicitante}, hemos atendido tu solicitud.
                            </p>
                        </div>
                        
                        <div style="background: white; border-radius: 12px; padding: 24px; margin-top: 20px; border-left: 4px solid #22c55e;">
                            <h3 style="margin-top: 0; color: #374151; font-size: 14px;">Detalles del ticket resuelto</h3>
                            <p style="margin: 8px 0; color: #4b5563;"><strong>Número:</strong> #${id}</p>
                            <p style="margin: 8px 0; color: #4b5563;"><strong>Problema:</strong> ${ticketData.titulo}</p>
                            <p style="margin: 8px 0; color: #4b5563;"><strong>Estado:</strong> <span style="background: #dcfce7; color: #166534; padding: 4px 12px; border-radius: 20px; font-weight: bold;">RESUELTO</span></p>
                        </div>
                        
                        <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin-top: 20px;">
                            <p style="margin: 0; color: #6b7280; font-size: 14px;">
                                <strong>¿Necesitas algo más?</strong><br>
                                No dudes en crear un nuevo ticket si tienes alguna otra consulta.
                            </p>
                        </div>
                        
                        <div style="text-align: center; margin-top: 30px; color: #9ca3af; font-size: 12px;">
                            Este es un correo automático del sistema de tickets.<br>
                            Equipo de IT 💜
                        </div>
                    </div>
                `
            };

            sgMail.send(msg)
                .then(() => console.log('Email de resolución enviado a:', ticketData.email))
                .catch(err => console.log('Error enviando email de resolución:', err.message));
        }
        
        res.json({ exito: true, notificado: estado === 'Cerrado' });
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar ticket
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

app.listen(PORT, () => {
    console.log('Servidor funcionando en puerto', PORT);
});
