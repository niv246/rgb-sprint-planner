const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

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

      // Determine category from labels
      let category = 'backend';
      for (const label of labels) {
        if (LABEL_CATEGORY_MAP[label]) {
          category = LABEL_CATEGORY_MAP[label];
          break;
        }
      }

      // Determine priority from labels
      let priority = 'p1';
      for (const label of labels) {
        if (LABEL_PRIORITY_MAP[label]) {
          priority = LABEL_PRIORITY_MAP[label];
          break;
        }
      }

      // Check field values for Status
      const fieldValues = item.fieldValues?.nodes || [];
      let statusField = null;
      for (const fv of fieldValues) {
        if (fv.field?.name === 'Status') {
          statusField = fv.name;
        }
      }

      // Upsert — find by githubId
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

    // Save
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
