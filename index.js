// PokerBar RAS API v1.7
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/users/:id', async (req, res) => {
  const { id } = req.params;
  const isRasCode = id.startsWith('RAS-');
  const { data, error } = isRasCode
    ? await supabase.from('users').select('*').eq('member_code', id).single()
    : await supabase.from('users').select('*').eq('line_id', id).single();
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

app.get('/history/:user_id', async (req, res) => {
  const { user_id } = req.params;
  const { data, error } = await supabase
    .from('point_transactions')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return res.status(500).json({ error });
  res.json(data);
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
  // リセット日時を取得
  const { data: resetData } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'ranking_reset_at')
    .single();

  const resetAt = resetData?.value || '2000-01-01T00:00:00Z';

  const { data, error } = await supabase
    .from('point_transactions')
    .select('user_id, amount, users(display_name, member_code)')
    .gte('created_at', resetAt);
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

app.post('/ranking/reset', async (req, res) => {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('settings')
    .upsert([{ key: 'ranking_reset_at', value: now }], { onConflict: 'key' });
  if (error) return res.status(500).json({ error });
  res.json({ message: 'ランキングをリセットしました！', reset_at: now });
});

app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  for (const event of events) {
    if (event.type === 'follow') {
      const lineId = event.source.userId;
      let displayName = '新規会員';
      let avatarUrl = null;
      try {
        const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${lineId}`, {
          headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` }
        });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          displayName = profile.displayName || '新規会員';
          avatarUrl = profile.pictureUrl || null;
        }
      } catch (e) {
        console.error('プロフィール取得エラー:', e);
      }
      const memberCode = 'RAS-' + Math.floor(100000 + Math.random() * 900000);
      await supabase.from('users').upsert([{
        line_id: lineId,
        display_name: displayName,
        avatar_url: avatarUrl,
        rank: 'STANDARD',
        member_code: memberCode,
      }], { onConflict: 'line_id' });
    }
  }
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`PokerBar RAS API サーバー起動 http://localhost:${PORT}`);
  });
}

module.exports = app;