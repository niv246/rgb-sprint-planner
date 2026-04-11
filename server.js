const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Data directory — use Railway volume if available
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? process.env.RAILWAY_VOLUME_MOUNT_PATH
  : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'sprint-data.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Seed data
function getSeedData() {
  const categories = [
    { id: 'backend', name: 'Backend', color: '#3B82F6' },
    { id: 'frontend', name: 'Frontend', color: '#EC4899' },
    { id: 'business', name: 'Business', color: '#F59E0B' },
    { id: 'legal', name: 'Legal', color: '#6366F1' },
    { id: 'design', name: 'Design', color: '#8B5CF6' },
    { id: 'marketing', name: 'Marketing', color: '#10B981' },
    { id: 'security', name: 'Security', color: '#EF4444' },
    { id: 'devops', name: 'DevOps', color: '#14B8A6' },
  ];

  const seedTasks = [
    { name: 'חיבור Electron Uploader לbackend', category: 'backend', priority: 'p0', assignee: 'omer' },
    { name: 'S3 presigned multipart upload', category: 'backend', priority: 'p0', assignee: 'omer' },
    { name: 'WhatsApp Bot — P0 read-only', category: 'backend', priority: 'p0', assignee: 'omer' },
    { name: 'SEO — Next.js SSG landing pages', category: 'frontend', priority: 'p1', assignee: 'niv' },
    { name: 'Calculator page — Figma Make', category: 'frontend', priority: 'p1', assignee: 'niv' },
    { name: 'Producer Dashboard MVP', category: 'frontend', priority: 'p1', assignee: 'niv' },
    { name: 'Event publish flow — 6 steps', category: 'frontend', priority: 'p0', assignee: 'niv' },
    { name: 'GDPR/Amendment 13 — column encryption', category: 'security', priority: 'p0', assignee: 'dana' },
    { name: 'Consent architecture — 2-stage', category: 'legal', priority: 'p0', assignee: 'dana' },
    { name: 'Privacy Policy + DPA final review', category: 'legal', priority: 'p1', assignee: 'dana' },
    { name: 'Pitch deck לSeed round', category: 'business', priority: 'p2', assignee: 'niv' },
    { name: 'מודל תמחור — 4 tiers validation', category: 'business', priority: 'p1', assignee: 'niv' },
    { name: 'Google Search Console setup', category: 'marketing', priority: 'p1', assignee: 'niv' },
    { name: 'Blog content calendar', category: 'marketing', priority: 'p2', assignee: 'niv' },
    { name: 'KMS — 6 CMKs setup', category: 'devops', priority: 'p0', assignee: 'omer' },
    { name: 'Design system — Figma tokens sync', category: 'design', priority: 'p1', assignee: 'niv' },
  ];

  let nextId = 1;
  const tasks = seedTasks.map(s => ({
    id: nextId++,
    name: s.name,
    category: s.category,
    priority: s.priority,
    assignee: s.assignee,
    note: '',
    weeklyAssignment: null,
  }));

  return {
    categories,
    tasks,
    currentWeek: 1,
    currentCycle: 1,
    collapsedCategories: {},
    nextId,
    monthlyWidth: 380,
  };
}

// Create seed file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(getSeedData(), null, 2), 'utf8');
}

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// API endpoints
app.get('/api/state', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    res.json(data);
  } catch (e) {
    res.json(getSeedData());
  }
});

app.post('/api/state', (req, res) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save state' });
  }
});

app.post('/api/state/reset', (req, res) => {
  try {
    const seed = getSeedData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2), 'utf8');
    res.json(seed);
  } catch (e) {
    res.status(500).json({ error: 'Failed to reset state' });
  }
});

// Fallback — serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`RGB Sprint Planner running on port ${PORT}`);
});
