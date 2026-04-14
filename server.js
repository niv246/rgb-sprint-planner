const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Data directory — use Railway volume if available
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? process.env.RAILWAY_VOLUME_MOUNT_PATH
  : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'sprint-data.json');
const BACKUP_FILE = path.join(DATA_DIR, 'sprint-data.backup.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Log volume status on startup
console.log(`[DATA] Volume mount: ${process.env.RAILWAY_VOLUME_MOUNT_PATH || '(none — using local ./data)'}`);
console.log(`[DATA] Data file: ${DATA_FILE}`);
console.log(`[DATA] File exists: ${fs.existsSync(DATA_FILE)}`);

// ── Auth ──
const ALLOWED_EMAILS = ['nivye@rgb-ai.com', 'dana@rgb-ai.com', 'omer@rgb-ai.com'];
const AUTH_COOKIE = 'rgb_session';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

function generateToken(email) {
  const secret = process.env.APP_PASSWORD || 'fallback';
  return crypto.createHmac('sha256', secret).update(email).digest('hex');
}

function authMiddleware(req, res, next) {
  if (req.path === '/login' || req.path === '/api/login') return next();
  if (req.path.endsWith('.css') || req.path.endsWith('.ico')) return next();

  const cookie = req.cookies[AUTH_COOKIE];
  if (!cookie) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' });
    return res.redirect('/login');
  }

  try {
    const parsed = JSON.parse(Buffer.from(cookie, 'base64').toString());
    const expected = generateToken(parsed.email);
    if (parsed.token === expected && ALLOWED_EMAILS.includes(parsed.email)) {
      req.userEmail = parsed.email;
      return next();
    }
  } catch (e) {}

  res.clearCookie(AUTH_COOKIE);
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Invalid session' });
  return res.redirect('/login');
}

// ── Login Page HTML ──
const LOGIN_HTML = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RGB Sprint Planner — Login</title>
<link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Rubik', sans-serif;
    background: #F8F8F6;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .login-card {
    background: white;
    border-radius: 12px;
    padding: 40px 32px;
    width: 360px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    text-align: center;
  }
  .login-logo {
    font-size: 24px;
    font-weight: 700;
    color: #6366F1;
    margin-bottom: 4px;
  }
  .login-logo span { color: #9B9B9B; font-weight: 400; font-size: 14px; }
  .login-subtitle {
    font-size: 13px;
    color: #6B6B6B;
    margin-bottom: 28px;
  }
  .field { margin-bottom: 16px; text-align: right; }
  .field label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: #6B6B6B;
    margin-bottom: 4px;
  }
  .field input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #E5E5E0;
    border-radius: 8px;
    font-family: inherit;
    font-size: 14px;
    outline: none;
    transition: border 0.15s;
    direction: ltr;
    text-align: left;
  }
  .field input:focus { border-color: #6366F1; }
  .login-btn {
    width: 100%;
    padding: 11px;
    background: #6366F1;
    color: white;
    border: none;
    border-radius: 8px;
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    margin-top: 8px;
  }
  .login-btn:hover { background: #5558E6; }
  .login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .error-msg {
    color: #EF4444;
    font-size: 12px;
    margin-top: 12px;
    display: none;
  }
</style>
</head>
<body>
<div class="login-card">
  <div class="login-logo">RGB <span>Sprint Planner</span></div>
  <div class="login-subtitle">כניסה לצוות המייסדים</div>
  <div class="field">
    <label>אימייל</label>
    <input type="email" id="email" placeholder="you@rgb-ai.com" />
  </div>
  <div class="field">
    <label>סיסמה</label>
    <input type="password" id="password" placeholder="סיסמה" />
  </div>
  <button class="login-btn" id="login-btn" onclick="doLogin()">כניסה</button>
  <div class="error-msg" id="error-msg"></div>
</div>
<script>
  document.getElementById('email').focus();
  document.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

  async function doLogin() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const btn = document.getElementById('login-btn');
    const err = document.getElementById('error-msg');

    if (!email || !password) {
      err.textContent = 'נא למלא אימייל וסיסמה';
      err.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'מתחבר...';
    err.style.display = 'none';

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (data.ok) {
        window.location.href = '/';
      } else {
        err.textContent = data.error || 'שגיאה בכניסה';
        err.style.display = 'block';
      }
    } catch (e) {
      err.textContent = 'שגיאת חיבור';
      err.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'כניסה';
    }
  }
</script>
</body>
</html>`;

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
    currentView: 'sprint',
    meetings: [],
    meetingNextId: 1,
    calendarMonth: new Date().getMonth(),
    calendarYear: new Date().getFullYear(),
  };
}

// Create seed file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(getSeedData(), null, 2), 'utf8');
}

// ── Middleware ──
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ── Login routes (BEFORE auth middleware) ──
app.get('/login', (req, res) => {
  res.send(LOGIN_HTML);
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const appPassword = process.env.APP_PASSWORD;

  if (!appPassword) {
    return res.status(500).json({ error: 'APP_PASSWORD not configured' });
  }

  const normalizedEmail = (email || '').trim().toLowerCase();

  if (!ALLOWED_EMAILS.includes(normalizedEmail)) {
    return res.status(401).json({ error: 'אימייל לא מורשה' });
  }

  if (password !== appPassword) {
    return res.status(401).json({ error: 'סיסמה שגויה' });
  }

  const token = generateToken(normalizedEmail);
  const cookieValue = Buffer.from(JSON.stringify({ email: normalizedEmail, token })).toString('base64');

  res.cookie(AUTH_COOKIE, cookieValue, {
    maxAge: COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: 'lax',
  });

  res.json({ ok: true, email: normalizedEmail });
});

app.get('/api/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE);
  res.redirect('/login');
});

// ── Auth gate — everything below requires login ──
app.use(authMiddleware);

// ── Static files (protected) ──
app.use(express.static(path.join(__dirname, 'public')));

// ── API endpoints ──
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
    // Backup current file before overwriting
    if (fs.existsSync(DATA_FILE)) {
      try { fs.copyFileSync(DATA_FILE, BACKUP_FILE); } catch {}
    }
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

// Restore from backup
app.post('/api/state/restore-backup', (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_FILE)) {
      return res.status(404).json({ error: 'No backup found' });
    }
    const backup = fs.readFileSync(BACKUP_FILE, 'utf8');
    fs.writeFileSync(DATA_FILE, backup, 'utf8');
    res.json(JSON.parse(backup));
  } catch (e) {
    res.status(500).json({ error: 'Failed to restore backup' });
  }
});

// Health check — shows data stats
app.get('/api/health', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const hasBackup = fs.existsSync(BACKUP_FILE);
    res.json({
      ok: true,
      volume: process.env.RAILWAY_VOLUME_MOUNT_PATH || null,
      dataFile: fs.existsSync(DATA_FILE),
      tasks: data.tasks?.length || 0,
      meetings: data.meetings?.length || 0,
      hasBackup,
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── GitHub Projects V2 Sync ──
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_ORG = process.env.GITHUB_ORG || 'rgb-ai-platform';
const GITHUB_PROJECT_NUMBER = parseInt(process.env.GITHUB_PROJECT_NUMBER || '1', 10);

const ASSIGNEE_MAP = {
  'niv246': 'niv',
  'omer-github-username': 'omer',
  'dana-github-username': 'dana',
};

const LABEL_CATEGORY_MAP = {
  'backend': 'backend',
  'frontend': 'frontend',
  'business': 'business',
  'legal': 'legal',
  'design': 'design',
  'marketing': 'marketing',
  'security': 'security',
  'devops': 'devops',
};

const LABEL_PRIORITY_MAP = {
  'p0': 'p0',
  'p1': 'p1',
  'p2': 'p2',
  'critical': 'p0',
  'high': 'p0',
  'medium': 'p1',
  'low': 'p2',
};

app.post('/api/sync-github', async (req, res) => {
  if (!GITHUB_TOKEN) {
    return res.status(400).json({ error: 'GITHUB_TOKEN not configured on server' });
  }

  const query = `query($org: String!, $number: Int!, $cursor: String) {
    organization(login: $org) {
      projectV2(number: $number) {
        items(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            content {
              ... on Issue {
                id
                number
                title
                labels(first: 10) { nodes { name } }
                assignees(first: 5) { nodes { login } }
                state
              }
              ... on DraftIssue {
                title
              }
            }
            fieldValues(first: 10) {
              nodes {
                ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } }
                ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2Field { name } } }
              }
            }
          }
        }
      }
    }
  }`;

  try {
    let allItems = [];
    let cursor = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables: { org: GITHUB_ORG, number: GITHUB_PROJECT_NUMBER, cursor } }),
      });

      const json = await response.json();
      if (json.errors) {
        return res.status(400).json({ error: json.errors[0].message });
      }

      const project = json.data?.organization?.projectV2;
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const items = project.items;
      allItems = allItems.concat(items.nodes);
      hasNextPage = items.pageInfo.hasNextPage;
      cursor = items.pageInfo.endCursor;
    }

    // Load current state
    let data;
    try {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch {
      data = getSeedData();
    }

    let added = 0;
    let updated = 0;

    for (const item of allItems) {
      const content = item.content;
      if (!content || !content.title) continue;

      const githubId = content.id || item.id;
      const title = content.title;
      const labels = content.labels?.nodes?.map(l => l.name.toLowerCase()) || [];
      const assigneeLogin = content.assignees?.nodes?.[0]?.login;
      const assignee = ASSIGNEE_MAP[assigneeLogin] || 'niv';

      let category = 'backend';
      for (const label of labels) {
        if (LABEL_CATEGORY_MAP[label]) { category = LABEL_CATEGORY_MAP[label]; break; }
      }

      let priority = 'p1';
      for (const label of labels) {
        if (LABEL_PRIORITY_MAP[label]) { priority = LABEL_PRIORITY_MAP[label]; break; }
      }

      const fieldValues = item.fieldValues?.nodes || [];
      let statusField = null;
      for (const fv of fieldValues) {
        if (fv.field?.name === 'Status') statusField = fv.name;
      }

      const existing = data.tasks.find(t => t.githubId === githubId);
      if (existing) {
        existing.name = title;
        existing.category = category;
        existing.priority = priority;
        existing.assignee = assignee;
        if (statusField) existing.githubStatus = statusField;
        updated++;
      } else {
        data.tasks.push({
          id: data.nextId++,
          name: title,
          category,
          priority,
          assignee,
          note: '',
          weeklyAssignment: null,
          githubId,
          githubStatus: statusField,
        });
        added++;
      }
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    res.json({ ok: true, added, updated, total: allItems.length });
  } catch (e) {
    console.error('GitHub sync error:', e);
    res.status(500).json({ error: 'Sync failed: ' + e.message });
  }
});

// Fallback — serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`RGB Sprint Planner running on port ${PORT}`);
});
