const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

app.get('/', (req, res) => {
  res.json({ message: 'PokerBar RAS API 起動中！🃏' });
});

app.get('/users/:line_id', async (req, res) => {
  const { line_id } = req.params;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('line_id', line_id)
    .single();
  if (error) return res.status(404).json({ error: '会員が見つかりません' });
  res.json(data);
});

app.get('/points/:user_id', async (req, res) => {
  const { user_id } = req.params;
  const { data, error } = await supabase
    .from('point_transactions')
    .select('amount')
    .eq('user_id', user_id);
  if (error) return res.status(500).json({ error });
  const total = data.reduce((sum, t) => sum + t.amount, 0);
  res.json({ total_points: total });
});

app.post('/points/grant', async (req, res) => {
  const { user_id, amount, type, note, staff_id } = req.body;
  const { data, error } = await supabase
    .from('point_transactions')
    .insert([{ user_id, amount, type, note, staff_id }]);
  if (error) return res.status(500).json({ error });
  res.json({ message: `${amount}pt を付与しました！`, data });
});

app.get('/ranking', async (req, res) => {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('point_transactions')
    .select('user_id, amount, users(display_name, member_code)')
    .gte('created_at', startOfMonth.toISOString());
  if (error) return res.status(500).json({ error });
  const ranking = {};
  data.forEach(t => {
    if (!ranking[t.user_id]) {
      ranking[t.user_id] = {
        display_name: t.users?.display_name,
        member_code: t.users?.member_code,
        total: 0
      };
    }
    ranking[t.user_id].total += t.amount;
  });
  const sorted = Object.entries(ranking)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 20)
    .map(([user_id, info], i) => ({ rank: i + 1, user_id, ...info }));
  res.json(sorted);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PokerBar RAS API サーバー起動 http://localhost:${PORT}`);
});