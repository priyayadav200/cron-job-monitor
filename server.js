const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cronwatch_secret_key_change_in_production';
const DB_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json());

// ============================================================
// SIMPLE FILE-BASED DATABASE
// stores users and their custom jobs in a JSON file
// ============================================================

function readDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (e) {}
  return { users: [], jobs: {}, pings: {} };
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// initialize db file if missing
if (!fs.existsSync(DB_FILE)) {
  writeDB({ users: [], jobs: {}, pings: {} });
}

// ============================================================
// AUTH MIDDLEWARE
// ============================================================

function authMiddleware(req, res, next) {
  var header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Login required' });
  }
  var token = header.split(' ')[1];
  try {
    var decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired session. Please login again.' });
  }
}

// ============================================================
// AUTH ROUTES
// ============================================================

// POST /api/auth/signup
app.post('/api/auth/signup', function(req, res) {
  var name = (req.body.name || '').trim();
  var email = (req.body.email || '').trim().toLowerCase();
  var password = req.body.password || '';

  if (!name || name.length < 2) return res.status(400).json({ error: 'Name must be at least 2 characters' });
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Enter a valid email address' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  var db = readDB();
  var existing = db.users.find(function(u) { return u.email === email; });
  if (existing) return res.status(409).json({ error: 'Account with this email already exists' });

  var hashedPassword = bcrypt.hashSync(password, 10);
  var userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

  db.users.push({
    id: userId,
    name: name,
    email: email,
    password: hashedPassword,
    createdAt: new Date().toISOString()
  });

  // seed demo jobs for new user so dashboard isn't empty
  db.jobs[userId] = getDefaultJobs();
  if (!db.pings) db.pings = {};
  writeDB(db);

  var token = jwt.sign({ id: userId, name: name, email: email }, JWT_SECRET, { expiresIn: '7d' });

  res.json({
    token: token,
    user: { id: userId, name: name, email: email }
  });
});

// POST /api/auth/login
app.post('/api/auth/login', function(req, res) {
  var email = (req.body.email || '').trim().toLowerCase();
  var password = req.body.password || '';

  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  var db = readDB();
  var user = db.users.find(function(u) { return u.email === email; });
  if (!user) return res.status(401).json({ error: 'No account found with this email' });

  var valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Incorrect password' });

  var token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

  res.json({
    token: token,
    user: { id: user.id, name: user.name, email: user.email }
  });
});

// GET /api/auth/me — check current session
app.get('/api/auth/me', authMiddleware, function(req, res) {
  res.json({ user: req.user });
});

// ============================================================
// DEFAULT SEED JOBS (given to every new user)
// ============================================================

function getDefaultJobs() {
  var ts = Date.now();
  return [
    {
      id: 'job_' + ts + '_1', name: 'Database Backup', schedule: '0 2 * * *',
      environment: 'production', group: 'Database', avgDuration: 45000, failRate: 0.03,
      active: true, createdAt: new Date(ts - 604800000).toISOString(),
      gracePeriod: 300, tags: ['backup', 'database'],
      alertChannels: ['email'], alertWebhook: '', maintenanceWindow: null,
      description: 'Daily full database backup to S3 bucket with verification'
    },
    {
      id: 'job_' + ts + '_2', name: 'Log Cleanup', schedule: '0 3 * * *',
      environment: 'production', group: 'Maintenance', avgDuration: 12000, failRate: 0.02,
      active: true, createdAt: new Date(ts - 518400000).toISOString(),
      gracePeriod: 120, tags: ['logs', 'cleanup'],
      alertChannels: ['email'], alertWebhook: '', maintenanceWindow: null,
      description: 'Rotate and compress application logs older than 7 days'
    },
    {
      id: 'job_' + ts + '_3', name: 'Health Check', schedule: '*/5 * * * *',
      environment: 'production', group: 'Monitoring', avgDuration: 2000, failRate: 0.01,
      active: true, createdAt: new Date(ts - 432000000).toISOString(),
      gracePeriod: 60, tags: ['health', 'uptime'],
      alertChannels: ['email', 'slack'], alertWebhook: '', maintenanceWindow: null,
      description: 'Ping all service endpoints and verify response codes'
    },
    {
      id: 'job_' + ts + '_4', name: 'Email Digest', schedule: '0 8 * * 1-5',
      environment: 'production', group: 'Notifications', avgDuration: 8000, failRate: 0.04,
      active: true, createdAt: new Date(ts - 345600000).toISOString(),
      gracePeriod: 180, tags: ['email', 'notifications'],
      alertChannels: ['email'], alertWebhook: '', maintenanceWindow: null,
      description: 'Compile and send daily activity digest to subscribed users'
    },
    {
      id: 'job_' + ts + '_5', name: 'Cache Warmup', schedule: '*/30 * * * *',
      environment: 'staging', group: 'Performance', avgDuration: 15000, failRate: 0.06,
      active: true, createdAt: new Date(ts - 259200000).toISOString(),
      gracePeriod: 120, tags: ['cache', 'performance'],
      alertChannels: ['slack'], alertWebhook: '', maintenanceWindow: null,
      description: 'Pre-populate Redis cache with frequently accessed queries'
    },
    {
      id: 'job_' + ts + '_6', name: 'SSL Certificate Check', schedule: '0 6 * * *',
      environment: 'production', group: 'Security', avgDuration: 5000, failRate: 0.008,
      active: true, createdAt: new Date(ts - 172800000).toISOString(),
      gracePeriod: 300, tags: ['ssl', 'security'],
      alertChannels: ['email', 'slack'], alertWebhook: '', maintenanceWindow: null,
      description: 'Verify SSL certificates for all domains and alert on expiry'
    },
    {
      id: 'job_' + ts + '_7', name: 'Data Sync', schedule: '0 */4 * * *',
      environment: 'staging', group: 'Database', avgDuration: 30000, failRate: 0.07,
      active: true, createdAt: new Date(ts - 86400000).toISOString(),
      gracePeriod: 240, tags: ['sync', 'etl'],
      alertChannels: ['email'], alertWebhook: '', maintenanceWindow: null,
      description: 'Sync production data snapshot to staging for testing'
    },
    {
      id: 'job_' + ts + '_8', name: 'Invoice Generator', schedule: '0 1 1 * *',
      environment: 'production', group: 'Billing', avgDuration: 60000, failRate: 0.02,
      active: true, createdAt: new Date(ts - 86400000).toISOString(),
      gracePeriod: 600, tags: ['billing', 'invoices'],
      alertChannels: ['email', 'slack'], alertWebhook: '', maintenanceWindow: null,
      description: 'Generate monthly invoices for all active subscriptions'
    }
  ];
}

// ============================================================
// JOB CRUD ROUTES (protected)
// ============================================================

// POST /api/jobs — add a new job
app.post('/api/jobs', authMiddleware, function(req, res) {
  var name = (req.body.name || '').trim();
  var schedule = (req.body.schedule || '').trim();
  var environment = req.body.environment || 'production';
  var group = (req.body.group || 'General').trim();

  if (!name) return res.status(400).json({ error: 'Job name is required' });
  if (!schedule) return res.status(400).json({ error: 'Cron schedule is required' });
  if (!isValidCron(schedule)) return res.status(400).json({ error: 'Invalid cron expression. Use format like "0 2 * * *"' });

  var db = readDB();
  var userId = req.user.id;
  if (!db.jobs[userId]) db.jobs[userId] = [];

  // check duplicate name
  var dup = db.jobs[userId].find(function(j) { return j.name.toLowerCase() === name.toLowerCase(); });
  if (dup) return res.status(409).json({ error: 'A job with this name already exists' });

  var job = {
    id: 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    name: name,
    schedule: schedule,
    environment: environment,
    group: group,
    avgDuration: parseInt(req.body.avgDuration) || 10000,
    failRate: parseFloat(req.body.failRate) || 0.05,
    active: true,
    createdAt: new Date().toISOString(),
    gracePeriod: parseInt(req.body.gracePeriod) || 120,
    tags: req.body.tags || [],
    alertChannels: req.body.alertChannels || ['email'],
    alertWebhook: req.body.alertWebhook || '',
    maintenanceWindow: null,
    description: req.body.description || ''
  };

  db.jobs[userId].push(job);
  writeDB(db);

  res.json({ message: 'Job added', job: job });
});

// PUT /api/jobs/:id — update a job
app.put('/api/jobs/:id', authMiddleware, function(req, res) {
  var db = readDB();
  var userId = req.user.id;
  var jobs = db.jobs[userId] || [];
  var idx = jobs.findIndex(function(j) { return j.id === req.params.id; });
  if (idx === -1) return res.status(404).json({ error: 'Job not found' });

  var job = jobs[idx];
  if (req.body.name) job.name = req.body.name.trim();
  if (req.body.schedule) {
    if (!isValidCron(req.body.schedule)) return res.status(400).json({ error: 'Invalid cron expression' });
    job.schedule = req.body.schedule.trim();
  }
  if (req.body.environment) job.environment = req.body.environment;
  if (req.body.group) job.group = req.body.group.trim();
  if (req.body.avgDuration !== undefined) job.avgDuration = parseInt(req.body.avgDuration) || 10000;
  if (req.body.failRate !== undefined) job.failRate = parseFloat(req.body.failRate) || 0.05;
  if (req.body.active !== undefined) job.active = !!req.body.active;
  if (req.body.gracePeriod !== undefined) job.gracePeriod = parseInt(req.body.gracePeriod) || 120;
  if (req.body.tags !== undefined) job.tags = req.body.tags;
  if (req.body.alertChannels !== undefined) job.alertChannels = req.body.alertChannels;
  if (req.body.alertWebhook !== undefined) job.alertWebhook = req.body.alertWebhook;
  if (req.body.maintenanceWindow !== undefined) job.maintenanceWindow = req.body.maintenanceWindow;
  if (req.body.description !== undefined) job.description = req.body.description;

  db.jobs[userId][idx] = job;
  writeDB(db);

  res.json({ message: 'Job updated', job: job });
});

// DELETE /api/jobs/:id — remove a job
app.delete('/api/jobs/:id', authMiddleware, function(req, res) {
  var db = readDB();
  var userId = req.user.id;
  var jobs = db.jobs[userId] || [];
  var idx = jobs.findIndex(function(j) { return j.id === req.params.id; });
  if (idx === -1) return res.status(404).json({ error: 'Job not found' });

  var removed = jobs.splice(idx, 1)[0];
  db.jobs[userId] = jobs;
  writeDB(db);

  res.json({ message: 'Job deleted', job: removed });
});

// ============================================================
// PING / HEARTBEAT ENDPOINT (public — called by cron jobs)
// ============================================================

// POST /ping/:jobId — heartbeat endpoint
app.get('/ping/:jobId', function(req, res) {
  var db = readDB();
  if (!db.pings) db.pings = {};
  if (!db.pings[req.params.jobId]) db.pings[req.params.jobId] = [];

  db.pings[req.params.jobId].push({
    timestamp: new Date().toISOString(),
    status: req.query.state || 'complete',
    duration: parseInt(req.query.duration) || null,
    message: req.query.msg || 'OK',
    ip: req.ip
  });

  // keep last 100 pings per job
  if (db.pings[req.params.jobId].length > 100) {
    db.pings[req.params.jobId] = db.pings[req.params.jobId].slice(-100);
  }

  writeDB(db);
  res.json({ ok: true, message: 'Ping received' });
});

// POST version
app.post('/ping/:jobId', function(req, res) {
  var db = readDB();
  if (!db.pings) db.pings = {};
  if (!db.pings[req.params.jobId]) db.pings[req.params.jobId] = [];

  db.pings[req.params.jobId].push({
    timestamp: new Date().toISOString(),
    status: (req.body && req.body.state) || req.query.state || 'complete',
    duration: parseInt((req.body && req.body.duration) || req.query.duration) || null,
    message: (req.body && req.body.msg) || req.query.msg || 'OK',
    ip: req.ip
  });

  if (db.pings[req.params.jobId].length > 100) {
    db.pings[req.params.jobId] = db.pings[req.params.jobId].slice(-100);
  }

  writeDB(db);
  res.json({ ok: true, message: 'Ping received' });
});

// ============================================================
// SIMULATION ENGINE
// generates execution history on-the-fly for user's jobs
// ============================================================

function generateHistory(job, days) {
  // seed random by job id so data is consistent per session
  var seed = hashCode(job.id);
  var rng = mulberry32(seed);

  var runs = [];
  var now = Date.now();
  var msPerDay = 86400000;

  var runsPerDay = 1;
  var sch = job.schedule;
  if (sch.startsWith('*/5')) runsPerDay = 288;
  else if (sch.startsWith('*/15')) runsPerDay = 96;
  else if (sch.startsWith('*/30')) runsPerDay = 48;
  else if (sch.indexOf('*/2') !== -1) runsPerDay = 12;
  else if (sch.indexOf('*/4') !== -1) runsPerDay = 6;
  else if (sch.startsWith('0 1 1')) runsPerDay = 0.14; // monthly
  else runsPerDay = 1;

  var totalRuns = Math.min(Math.ceil(runsPerDay * days), 200);
  if (totalRuns < 1) totalRuns = 1;
  var interval = (days * msPerDay) / totalRuns;

  for (var i = 0; i < totalRuns; i++) {
    var startTime = now - (totalRuns - i) * interval;
    startTime += (rng() - 0.5) * interval * 0.3;

    var failed = rng() < (job.failRate || 0.05);
    var duration = (job.avgDuration || 10000) * (0.6 + rng() * 0.8);
    if (failed) duration = duration * (0.3 + rng() * 0.4);

    var delayed = !failed && rng() < 0.08;
    var delayMs = delayed ? Math.floor(rng() * 30000) + 5000 : 0;

    // grace period breach
    var graceBreach = delayed && delayMs > (job.gracePeriod || 120) * 1000;

    runs.push({
      runId: 'run_' + i,
      startedAt: new Date(startTime).toISOString(),
      finishedAt: new Date(startTime + duration).toISOString(),
      duration: Math.round(duration),
      status: failed ? 'failed' : 'success',
      exitCode: failed ? (rng() > 0.5 ? 1 : 137) : 0,
      delayed: delayed,
      delayMs: delayMs,
      graceBreach: graceBreach,
      output: failed ? getErrorMsg(rng) : 'Completed successfully'
    });
  }
  return runs;
}

function getErrorMsg(rng) {
  var errors = [
    'Error: Connection timeout after 30000ms',
    'Fatal: Out of memory - process killed (exit 137)',
    'Error: ECONNREFUSED 127.0.0.1:5432',
    'Error: Lock file exists, another instance running',
    'Error: Permission denied writing to /var/log',
    'Error: API rate limit exceeded (429)',
    'Error: Disk space insufficient on /dev/sda1',
    'Fatal: Unhandled promise rejection',
    'Error: ETIMEOUT connecting to redis://localhost:6379',
    'Error: Certificate verification failed for smtp.gmail.com',
    'Fatal: Maximum call stack size exceeded',
    'Error: ENOSPC: no space left on device'
  ];
  return errors[Math.floor(rng() * errors.length)];
}

function hashCode(str) {
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function buildJobAnalytics(jobDef) {
  var history = generateHistory(jobDef, 7);
  var lastRun = history[history.length - 1];
  var failures = history.filter(function(r) { return r.status === 'failed'; });
  var successes = history.filter(function(r) { return r.status === 'success'; });
  var delayed = history.filter(function(r) { return r.delayed; });

  var durations = successes.map(function(r) { return r.duration; });
  var avgDur = durations.length > 0 ? durations.reduce(function(a, b) { return a + b; }, 0) / durations.length : 0;
  var sorted = durations.slice().sort(function(a, b) { return a - b; });

  var successRate = history.length > 0 ? successes.length / history.length : 1;
  var recent = history.slice(-10);
  var recentRate = recent.filter(function(r) { return r.status === 'success'; }).length / (recent.length || 1);
  var healthScore = Math.round((successRate * 0.4 + recentRate * 0.6) * 100);

  var healthStatus = 'healthy';
  if (healthScore < 70) healthStatus = 'critical';
  else if (healthScore < 85) healthStatus = 'degraded';
  else if (healthScore < 95) healthStatus = 'warning';

  // uptime calculation (percentage of time the job is healthy)
  var uptime = history.length > 0 ? (successes.length / history.length * 100) : 100;

  // success streak
  var streak = 0;
  for (var i = history.length - 1; i >= 0; i--) {
    if (history[i].status === 'success') streak++;
    else break;
  }

  // MTBF (mean time between failures) in minutes
  var failTimes = failures.map(function(r) { return new Date(r.startedAt).getTime(); }).sort();
  var mtbf = 0;
  if (failTimes.length > 1) {
    var gaps = [];
    for (var fi = 1; fi < failTimes.length; fi++) {
      gaps.push(failTimes[fi] - failTimes[fi - 1]);
    }
    mtbf = Math.round(gaps.reduce(function(a, b) { return a + b; }, 0) / gaps.length / 60000);
  }

  // MTTR (mean time to recovery) — average time between a failure and next success
  var mttr = 0;
  var recoveryTimes = [];
  for (var ri = 0; ri < history.length - 1; ri++) {
    if (history[ri].status === 'failed') {
      for (var rj = ri + 1; rj < history.length; rj++) {
        if (history[rj].status === 'success') {
          recoveryTimes.push(new Date(history[rj].startedAt).getTime() - new Date(history[ri].startedAt).getTime());
          break;
        }
      }
    }
  }
  if (recoveryTimes.length > 0) {
    mttr = Math.round(recoveryTimes.reduce(function(a, b) { return a + b; }, 0) / recoveryTimes.length / 60000);
  }

  // daily stats for chart
  var dailyStats = [];
  var now = Date.now();
  for (var d = 6; d >= 0; d--) {
    var dayStart = now - (d + 1) * 86400000;
    var dayEnd = now - d * 86400000;
    var dr = history.filter(function(r) { var t = new Date(r.startedAt).getTime(); return t >= dayStart && t < dayEnd; });
    var df = dr.filter(function(r) { return r.status === 'failed'; });
    var dayDurations = dr.filter(function(r) { return r.status === 'success'; }).map(function(r) { return r.duration; });
    var dayAvgDur = dayDurations.length > 0 ? Math.round(dayDurations.reduce(function(a, b) { return a + b; }, 0) / dayDurations.length) : 0;

    dailyStats.push({
      date: new Date(dayEnd).toISOString().split('T')[0],
      dayLabel: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(dayEnd).getDay()],
      total: dr.length,
      failed: df.length,
      success: dr.length - df.length,
      avgDuration: dayAvgDur
    });
  }

  // incidents (only failures with details)
  var incidents = failures.map(function(f, idx) {
    var resolved = true;
    var resolvedAt = null;
    // find next success after this failure
    var failIdx = history.indexOf(f);
    for (var ni = failIdx + 1; ni < history.length; ni++) {
      if (history[ni].status === 'success') {
        resolvedAt = history[ni].startedAt;
        break;
      }
    }
    return {
      id: 'inc_' + jobDef.id + '_' + idx,
      runId: f.runId,
      startedAt: f.startedAt,
      exitCode: f.exitCode,
      output: f.output,
      duration: f.duration,
      resolved: !!resolvedAt,
      resolvedAt: resolvedAt,
      severity: f.exitCode === 137 ? 'critical' : 'warning'
    };
  }).reverse();

  return {
    id: jobDef.id,
    name: jobDef.name,
    schedule: jobDef.schedule,
    scheduleHuman: cronToHuman(jobDef.schedule),
    environment: jobDef.environment,
    group: jobDef.group,
    active: jobDef.active,
    description: jobDef.description || '',
    tags: jobDef.tags || [],
    gracePeriod: jobDef.gracePeriod || 120,
    alertChannels: jobDef.alertChannels || ['email'],
    alertWebhook: jobDef.alertWebhook || '',
    maintenanceWindow: jobDef.maintenanceWindow || null,
    createdAt: jobDef.createdAt,
    lastRun: lastRun,
    lastStatus: lastRun.status,
    healthScore: healthScore,
    healthStatus: healthStatus,
    uptime: Math.round(uptime * 100) / 100,
    successStreak: streak,
    mtbf: mtbf,
    mttr: mttr,
    stats: {
      totalRuns: history.length,
      successCount: successes.length,
      failureCount: failures.length,
      delayedCount: delayed.length,
      successRate: Math.round(successRate * 10000) / 100,
      avgDuration: Math.round(avgDur),
      maxDuration: sorted.length > 0 ? Math.round(sorted[sorted.length - 1]) : 0,
      minDuration: sorted.length > 0 ? Math.round(sorted[0]) : 0,
      p95Duration: sorted.length > 0 ? Math.round(sorted[Math.floor(sorted.length * 0.95)]) : 0
    },
    incidents: incidents,
    dailyStats: dailyStats,
    recentRuns: history.slice(-30).reverse(),
    last5: history.slice(-5).reverse()
  };
}

function cronToHuman(cron) {
  var map = {
    '*/5 * * * *': 'Every 5 minutes', '*/15 * * * *': 'Every 15 minutes',
    '*/30 * * * *': 'Every 30 minutes', '0 */2 * * *': 'Every 2 hours',
    '0 */4 * * *': 'Every 4 hours', '0 2 * * *': 'Daily at 2:00 AM',
    '0 3 * * *': 'Daily at 3:00 AM', '0 6 * * *': 'Daily at 6:00 AM',
    '0 0 * * *': 'Daily at midnight', '0 8 * * 1-5': 'Weekdays at 8:00 AM',
    '0 10 * * 1-5': 'Weekdays at 10:00 AM', '0 9 1 * *': '1st of month at 9:00 AM',
    '0 1 1 * *': '1st of month at 1:00 AM'
  };
  return map[cron] || cron;
}

function isValidCron(str) {
  var parts = str.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) return false;
  return true;
}

// ============================================================
// PROTECTED API ROUTES (need login)
// ============================================================

// GET /api/dashboard
app.get('/api/dashboard', authMiddleware, function(req, res) {
  var db = readDB();
  var userJobs = (db.jobs[req.user.id] || []).filter(function(j) { return j.active; });

  var analytics = userJobs.map(buildJobAnalytics);
  var totalJobs = analytics.length;
  if (totalJobs === 0) {
    return res.json({
      overview: {
        totalJobs: 0, avgHealthScore: 0, avgUptime: 0,
        healthy: 0, warning: 0, degraded: 0, critical: 0,
        totalExecutions: 0, totalFailures: 0, totalDelayed: 0,
        overallSuccessRate: 0, totalIncidents: 0, openIncidents: 0
      },
      environments: {}, groups: {}
    });
  }

  var healthy = analytics.filter(function(j) { return j.healthStatus === 'healthy'; }).length;
  var warning = analytics.filter(function(j) { return j.healthStatus === 'warning'; }).length;
  var degraded = analytics.filter(function(j) { return j.healthStatus === 'degraded'; }).length;
  var critical = analytics.filter(function(j) { return j.healthStatus === 'critical'; }).length;

  var totalRuns = 0, totalFails = 0, totalDelayed = 0, totalIncidents = 0, openIncidents = 0;
  analytics.forEach(function(j) {
    totalRuns += j.stats.totalRuns;
    totalFails += j.stats.failureCount;
    totalDelayed += j.stats.delayedCount;
    totalIncidents += j.incidents.length;
    openIncidents += j.incidents.filter(function(inc) { return !inc.resolved; }).length;
  });

  var avgUptime = analytics.reduce(function(s, j) { return s + j.uptime; }, 0) / totalJobs;

  var envs = {};
  analytics.forEach(function(j) {
    if (!envs[j.environment]) envs[j.environment] = { total: 0, healthy: 0, failing: 0 };
    envs[j.environment].total++;
    if (j.healthStatus === 'healthy' || j.healthStatus === 'warning') envs[j.environment].healthy++;
    else envs[j.environment].failing++;
  });

  var groups = {};
  analytics.forEach(function(j) {
    if (!groups[j.group]) groups[j.group] = { count: 0, healthSum: 0 };
    groups[j.group].count++;
    groups[j.group].healthSum += j.healthScore;
  });
  Object.keys(groups).forEach(function(g) { groups[g].avgHealth = Math.round(groups[g].healthSum / groups[g].count); });

  res.json({
    overview: {
      totalJobs: totalJobs,
      avgHealthScore: Math.round(analytics.reduce(function(s, j) { return s + j.healthScore; }, 0) / totalJobs),
      avgUptime: Math.round(avgUptime * 100) / 100,
      healthy: healthy, warning: warning, degraded: degraded, critical: critical,
      totalExecutions: totalRuns, totalFailures: totalFails, totalDelayed: totalDelayed,
      overallSuccessRate: totalRuns > 0 ? Math.round((1 - totalFails / totalRuns) * 10000) / 100 : 0,
      totalIncidents: totalIncidents,
      openIncidents: openIncidents
    },
    environments: envs,
    groups: groups
  });
});

// GET /api/jobs — user's jobs
app.get('/api/jobs', authMiddleware, function(req, res) {
  var db = readDB();
  var userJobs = db.jobs[req.user.id] || [];
  var analytics = userJobs.map(function(j) {
    var a = buildJobAnalytics(j);
    return {
      id: a.id, name: a.name, schedule: a.schedule, scheduleHuman: a.scheduleHuman,
      environment: a.environment, group: a.group, active: a.active,
      description: a.description, tags: a.tags, gracePeriod: a.gracePeriod,
      alertChannels: a.alertChannels, createdAt: a.createdAt,
      lastRun: a.lastRun, lastStatus: a.lastStatus, healthScore: a.healthScore,
      healthStatus: a.healthStatus, uptime: a.uptime, successStreak: a.successStreak,
      mtbf: a.mtbf, mttr: a.mttr, stats: a.stats, last5: a.last5,
      incidentCount: a.incidents.length
    };
  });

  var env = req.query.env;
  var status = req.query.status;
  if (env) analytics = analytics.filter(function(j) { return j.environment === env; });
  if (status) analytics = analytics.filter(function(j) { return j.healthStatus === status; });

  analytics.sort(function(a, b) {
    var order = { critical: 0, degraded: 1, warning: 2, healthy: 3 };
    return (order[a.healthStatus] || 3) - (order[b.healthStatus] || 3);
  });

  res.json(analytics);
});

// GET /api/jobs/:id — full detail for a single job
app.get('/api/jobs/:id', authMiddleware, function(req, res) {
  var db = readDB();
  var userJobs = db.jobs[req.user.id] || [];
  var job = userJobs.find(function(j) { return j.id === req.params.id; });
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(buildJobAnalytics(job));
});

// GET /api/timeline
app.get('/api/timeline', authMiddleware, function(req, res) {
  var db = readDB();
  var userJobs = (db.jobs[req.user.id] || []).filter(function(j) { return j.active; });
  var limit = parseInt(req.query.limit) || 50;
  var allRuns = [];

  userJobs.forEach(function(j) {
    var a = buildJobAnalytics(j);
    a.recentRuns.forEach(function(r) {
      allRuns.push({
        jobId: a.id, jobName: a.name, environment: a.environment, group: a.group,
        runId: r.runId, startedAt: r.startedAt, finishedAt: r.finishedAt,
        duration: r.duration, status: r.status, exitCode: r.exitCode,
        delayed: r.delayed, delayMs: r.delayMs, output: r.output
      });
    });
  });

  allRuns.sort(function(a, b) { return new Date(b.startedAt) - new Date(a.startedAt); });
  res.json(allRuns.slice(0, limit));
});

// GET /api/incidents — all incidents across all jobs
app.get('/api/incidents', authMiddleware, function(req, res) {
  var db = readDB();
  var userJobs = (db.jobs[req.user.id] || []).filter(function(j) { return j.active; });
  var allIncidents = [];

  userJobs.forEach(function(j) {
    var a = buildJobAnalytics(j);
    a.incidents.forEach(function(inc) {
      allIncidents.push({
        jobId: a.id,
        jobName: a.name,
        environment: a.environment,
        group: a.group,
        id: inc.id,
        startedAt: inc.startedAt,
        exitCode: inc.exitCode,
        output: inc.output,
        duration: inc.duration,
        resolved: inc.resolved,
        resolvedAt: inc.resolvedAt,
        severity: inc.severity
      });
    });
  });

  allIncidents.sort(function(a, b) { return new Date(b.startedAt) - new Date(a.startedAt); });

  var filter = req.query.status;
  if (filter === 'open') allIncidents = allIncidents.filter(function(i) { return !i.resolved; });
  if (filter === 'resolved') allIncidents = allIncidents.filter(function(i) { return i.resolved; });

  res.json(allIncidents);
});

// ============================================================
// PAGE ROUTES (must be before static middleware)
// ============================================================

app.get('/', function(req, res) { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/login', function(req, res) { res.sendFile(path.join(__dirname, 'public', 'login.html')); });
app.get('/signup', function(req, res) { res.sendFile(path.join(__dirname, 'public', 'signup.html')); });
app.get('/dashboard', function(req, res) { res.sendFile(path.join(__dirname, 'public', 'dashboard.html')); });

// serve static files (CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, function() {
  console.log('CronWatch running at http://localhost:' + PORT);
});
