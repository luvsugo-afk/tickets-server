const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

let bot = null;
if (process.env.TELEGRAM_TOKEN) {
    bot = new TelegramBot(process.env.TELEGRAM_TOKEN);
}

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Servidor de tickets funcionando');
});

app.get('/tickets', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('tickets')
            .select('*')
            .order('fecha_creacion', { ascending: false });
        
        if (error) throw error;
        
        const orden = { 'Critica': 1, 'Alta': 2, 'Media': 3, 'Baja': 4 };
        data.sort((a, b) => orden[a.prioridad] - orden[b.prioridad]);
        
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/tickets', async (req, res) => {
    try {
        const { titulo, descripcion, solicitante, prioridad } = req.body;
        
        if (!titulo || !descripcion || !solicitante) {
            return res.status(400).json({ error: 'Faltan datos' });
        }

        const { data, error } = await supabase
            .from('tickets')
            .insert([{ 
                titulo, 
                descripcion, 
                solicitante, 
                prioridad: prioridad || 'Media' 
            }])
            .select();
        
        if (error) throw error;

        if (bot && process.env.TELEGRAM_CHAT) {
            const emojis = { 'Critica': '🔴', 'Alta': '🟠', 'Media': '🟡', 'Baja': '🟢' };
            const msg = `${emojis[prioridad] || '🟡'} Nuevo ticket #${data[0].id}\n\n${titulo}\nPor: ${solicitante}`;
            bot.sendMessage(process.env.TELEGRAM_CHAT, msg).catch(() => {});
        }

        res.json(data[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/tickets/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        
        const { error } = await supabase
            .from('tickets')
            .update({ estado })
            .eq('id', id);
        
        if (error) throw error;
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/tickets/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('tickets').delete().eq('id', id);
        if (error) throw error;
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log('Servidor corriendo en puerto', PORT);
});
