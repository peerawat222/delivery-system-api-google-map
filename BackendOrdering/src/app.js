const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const orderRoutes = require('./routes/orders.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => res.json({ message: 'API running' }));

module.exports = app;
