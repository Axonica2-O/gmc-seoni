const express = require('express');
const path = require('path');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';

// Firebase Initialize
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DB_URL
});

const db = admin.database();
const dataRef = db.ref('axonica2Data');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const defaultData = {
  notice: 'Welcome to Axonica 2.0 — GMC Seoni! Live schedule aur registrations start ho chuke hain.',
  committees: ['Sports', 'Cultural', 'Literary'],
  leaderboard: [
    { id: 1, name: '2024 Batch', points: 0 },
    { id: 2, name: '2025 Batch', points: 0 },
    { id: 3, name: '2026 Batch', points: 0 },
    { id: 4, name: 'Interns', points: 0 }
  ],
  events: [
    {
      id: 101,
      name: 'Cricket Tournament',
      committee: 'Sports',
      day: 'Day 1',
      time: '09:00 AM',
      venue: 'Main Ground',
      entryType: 'Batch-wise',
      regType: 'Team',
      status: 'Upcoming',
      coordinatorName: '',
      coordinatorPhone: '',
      rules: '11 players + 3 substitutes per batch team. Umpire decision will be final.'
    },
    {
      id: 102,
      name: 'Volleyball',
      committee: 'Sports',
      day: 'Day 2',
      time: '04:00 PM',
      venue: 'Volleyball Court',
      entryType: 'Batch-wise',
      regType: 'Team',
      status: 'Upcoming',
      coordinatorName: '',
      coordinatorPhone: '',
      rules: '6 players per team. Best of 3 sets.'
    },
    {
      id: 103,
      name: 'Solo Singing',
      committee: 'Cultural',
      day: 'Day 3',
      time: '05:00 PM',
      venue: 'Auditorium',
      entryType: 'Open',
      regType: 'Solo',
      status: 'Upcoming',
      coordinatorName: '',
      coordinatorPhone: '',
      rules: 'Time limit 4 minutes. Karaoke track pehle submit karein.'
    }
  ],
  registrations: []
};

async function readData() {
  const snap = await dataRef.once('value');
  let data = snap.val();
  if (!data) {
    await dataRef.set(defaultData);
    return JSON.parse(JSON.stringify(defaultData));
  }
  data.notice = data.notice ?? '';
  data.committees = data.committees || defaultData.committees;
  data.leaderboard = data.leaderboard || defaultData.leaderboard;
  data.events = data.events || [];
  data.registrations = data.registrations || [];
  return data;
}

async function writeData(data) {
  await dataRef.set(data);
}

function verifyAdmin(req, res, next) {
  if (req.headers['x-admin-pin'] !== ADMIN_PIN) {
    return res.status(401).json({ error: 'Galat Admin PIN!' });
  }
  next();
}

// --- PUBLIC ROUTES ---
app.get('/api/data', async (req, res) => {
  try {
    const data = await readData();
    res.json({
      notice: data.notice,
      committees: data.committees,
      leaderboard: data.leaderboard,
      events: data.events
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { name, batch, phone, eventName, regType, teamName, members } = req.body;
    if (!name || !batch || !phone || !eventName) {
      return res.status(400).json({ error: 'Saari zaroori details bharein.' });
    }
    const data = await readData();
    data.registrations.unshift({
      id: Date.now(),
      name: name.trim(),
      batch: batch.trim(),
      phone: phone.trim(),
      eventName: eventName.trim(),
      regType: regType || 'Solo',
      teamName: (teamName || '').trim(),
      members: (members || '').trim(),
      time: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    });
    await writeData(data);
    res.json({ success: true, message: 'Registration confirm ho gaya!' });
  } catch (err) {
    res.status(500).json({ error: 'Registration save nahi ho paya.' });
  }
});

// --- ADMIN ROUTES ---
app.post('/api/admin/verify', verifyAdmin, (req, res) => res.json({ success: true }));

app.get('/api/admin/all', verifyAdmin, async (req, res) => {
  try {
    res.json(await readData());
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/admin/notice', verifyAdmin, async (req, res) => {
  const data = await readData();
  data.notice = req.body.notice || '';
  await writeData(data);
  res.json({ success: true });
});

app.post('/api/admin/points', verifyAdmin, async (req, res) => {
  const { id, delta } = req.body;
  const data = await readData();
  const team = data.leaderboard.find(t => t.id === Number(id));
  if (team) {
    team.points = Math.max(0, team.points + Number(delta));
    await writeData(data);
  }
  res.json({ success: true });
});

app.post('/api/admin/committee', verifyAdmin, async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Committee naam zaroori hai' });
  const data = await readData();
  if (!data.committees.includes(name)) {
    data.committees.push(name);
    await writeData(data);
  }
  res.json({ success: true });
});

app.delete('/api/admin/committee/:name', verifyAdmin, async (req, res) => {
  const data = await readData();
  data.committees = data.committees.filter(c => c !== req.params.name);
  await writeData(data);
  res.json({ success: true });
});

app.post('/api/admin/event', verifyAdmin, async (req, res) => {
  const { name, committee, day, time, venue, entryType, regType, coordinatorName, coordinatorPhone, rules } = req.body;
  const data = await readData();
  data.events.push({
    id: Date.now(),
    name: name.trim(),
    committee: committee || 'Sports',
    day: day || 'Day 1',
    time: time.trim(),
    venue: venue.trim(),
    entryType: entryType || 'Open',
    regType: regType || 'Solo',
    status: 'Upcoming',
    coordinatorName: (coordinatorName || '').trim(),
    coordinatorPhone: (coordinatorPhone || '').trim(),
    rules: (rules || '').trim()
  });
  await writeData(data);
  res.json({ success: true });
});

app.put('/api/admin/event/:id', verifyAdmin, async (req, res) => {
  const data = await readData();
  const ev = data.events.find(e => e.id === Number(req.params.id));
  if (ev) {
    ['status', 'coordinatorName', 'coordinatorPhone', 'time', 'venue', 'day'].forEach(key => {
      if (req.body[key] !== undefined) ev[key] = req.body[key];
    });
    await writeData(data);
  }
  res.json({ success: true });
});

app.delete('/api/admin/event/:id', verifyAdmin, async (req, res) => {
  const data = await readData();
  data.events = data.events.filter(e => e.id !== Number(req.params.id));
  await writeData(data);
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`Axonica 2.0 running on port ${PORT}`));
