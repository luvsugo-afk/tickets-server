const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());

// Conectar a Supabase (URL hardcodeada, KEY en variable de entorno)
const supabase = createClient(
    'https://icyxaputskgxannjmtqv.supabase.co',  // Tu URL
    process.env.SUPABASE_KEY  // La key sigue en variable de entorno
);

// Ruta de prueba
app.get('/', (req, res) => {
    res.send('✅ Servidor funcionando');
});

// Crear ticket
app.post('/api/tickets', async (req, res) => {
    try {
        const { titulo, descripcion, solicitante, email, prioridad } = req.body;
        
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
        
        res.json({ exito: true, ticket: data[0] });
        
    } catch (err) {
        console.log('Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Panel IT - ver tickets
app.get('/api/admin/tickets', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('tickets')
            .select('*')
            .order('fecha_creacion', { ascending: false });
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cambiar estado
app.put('/api/admin/tickets/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        
        await supabase
            .from('tickets')
            .update({ estado })
            .eq('id', id);
            
        res.json({ exito: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Borrar
app.delete('/api/admin/tickets/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await supabase.from('tickets').delete().eq('id', id);
        res.json({ exito: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log('Servidor funcionando en puerto', PORT);
});
