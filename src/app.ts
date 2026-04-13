import express from 'express';
import generateRoute from './routes/generate.route';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '1mb' }));

// Health check — sem autenticação
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Rotas da API
app.use('/api', generateRoute);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada', code: 'NOT_FOUND' });
});

app.listen(PORT, () => {
  console.log(`ContentAI Backend running on port ${PORT}`);
});

export default app;
