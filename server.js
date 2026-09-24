require('dotenv').config();
const express    = require('express');
const fs         = require('fs');
const path       = require('path');
const nodemailer = require('nodemailer');

const app  = express();
const PORT = process.env.PORT || 3000;

const ADMIN_KEY  = process.env.ADMIN_KEY  || 'chuza-secret-123';
const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_PASS = process.env.EMAIL_PASS || '';
const EMAIL_TO   = process.env.EMAIL_TO   || EMAIL_USER;
const SUBMISSIONS_FILE = path.join(__dirname, 'submissions.json');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const blocked = ['server.js', 'package.json', 'package-lock.json', 'submissions.json', '.env'];
  if (blocked.includes(path.basename(req.path))) {
    return res.status(403).send('Forbidden');
  }
  next();
});

app.use(express.static(__dirname));

const hits = {};
function rateLimit(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  hits[ip] = (hits[ip] || []).filter(t => now - t < 10 * 60 * 1000);
  if (hits[ip].length >= 5) {
    return res.status(429).json({ ok: false, message: 'Bahut zyada messages. Thodi der baad try karein.' });
  }
  hits[ip].push(now);
  next();
}

function loadSubmissions() {
  try {
    return JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}
function saveSubmissions(data) {
  fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(data, null, 2));
}

app.post('/api/contact', rateLimit, (req, res) => {
  const { name, email, phone, service, package: pkg, message } = req.body || {};

  if (!name || !email || !message) {
    return res.status(400).json({ ok: false, message: 'Name, email aur message zaroori hain.' });
  }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    return res.status(400).json({ ok: false, message: 'Sahi email address daalein.' });
  }

  const submission = {
    id: Date.now(),
    name:    String(name).trim().slice(0, 100),
    email:   String(email).trim().slice(0, 150),
    phone:   String(phone || '').trim().slice(0, 30),
    service: String(service || 'Not sure yet'),
    package: String(pkg || 'Not sure yet'),
    message: String(message).trim().slice(0, 2000),
    date:    new Date().toISOString(),
    read:    false
  };

  const subs = loadSubmissions();
  subs.unshift(submission);
  saveSubmissions(subs);

  if (EMAIL_USER && EMAIL_PASS) {
    sendEmail(submission).catch(err => console.error('Email error:', err.message));
  }

  console.log('✅ New submission:', submission.name, '—', submission.service, '/', submission.package);

  res.json({ ok: true, message: "Message received! Hum jaldi rabta karenge." });
});

app.get('/api/submissions', (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).json({ ok: false, message: 'Invalid key' });
  }
  const subs = loadSubmissions();
  res.json({ ok: true, count: subs.length, data: subs });
});

app.get('/admin', (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.send('<h1 style="font-family:sans-serif;text-align:center;margin-top:40vh">401 — Invalid Key 🔒</h1>');
  }
  const subs = loadSubmissions();
  const rows = subs.map(s => `
    <tr>
      <td>${new Date(s.date).toLocaleString()}</td>
      <td><b>${esc(s.name)}</b><br><small>${esc(s.email)}${s.phone ? ' · ' + esc(s.phone) : ''}</small></td>
      <td><span style="background:#0156f3;color:#fff;padding:3px 10px;border-radius:20px;font-size:12px">${esc(s.service)}</span>
          <span style="background:#fdcd01;color:#111;padding:3px 10px;border-radius:20px;font-size:12px">${esc(s.package)}</span></td>
      <td>${esc(s.message)}</td>
    </tr>`).join('');

  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Admin — Chuza Creatives</title>
  <style>
    body{font-family:'Segoe UI',sans-serif;background:#f2f5fa;margin:0;padding:40px}
    h1{color:#111827} .count{color:#0156f3;font-weight:700}
    table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
    th{background:#111827;color:#fdcd01;text-align:left;padding:14px 16px;font-size:13px;text-transform:uppercase}
    td{padding:14px 16px;border-bottom:1px solid #eee;vertical-align:top;font-size:14px;max-width:400px}
    tr:hover td{background:#f8faff}
  </style></head><body>
    <h1>📋 Chuza Creatives — Messages <span class="count">(${subs.length})</span></h1>
    <table>
      <tr><th>Date</th><th>Client</th><th>Service / Package</th><th>Message</th></tr>
      ${rows || '<tr><td colspan="4" style="text-align:center;padding:40px">Abhi koi message nahi aaya.</td></tr>'}
    </table>
  </body></html>`);
});

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendEmail(sub) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_USER, pass: EMAIL_PASS }
  });

  await transporter.sendMail({
    from: `"Chuza Website" <${EMAIL_USER}>`,
    to: EMAIL_TO,
    subject: `🔔 New Lead — ${sub.name} (${sub.service} / ${sub.package})`,
    html: `
      <h2 style="color:#0156f3">New Contact Form Submission</h2>
      <table style="border-collapse:collapse">
        <tr><td style="padding:6px 12px"><b>Name:</b></td><td style="padding:6px 12px">${sub.name}</td></tr>
        <tr><td style="padding:6px 12px"><b>Email:</b></td><td style="padding:6px 12px">${sub.email}</td></tr>
        <tr><td style="padding:6px 12px"><b>Phone:</b></td><td style="padding:6px 12px">${sub.phone || '—'}</td></tr>
        <tr><td style="padding:6px 12px"><b>Service:</b></td><td style="padding:6px 12px">${sub.service}</td></tr>
        <tr><td style="padding:6px 12px"><b>Package:</b></td><td style="padding:6px 12px">${sub.package}</td></tr>
      </table>
      <p style="background:#f2f5fa;padding:14px;border-radius:8px">${sub.message}</p>
    `
  });
  console.log('📧 Email sent to', EMAIL_TO);
}

app.listen(PORT, () => {
  console.log('🚀 Chuza Creatives backend chal raha hai: http://localhost:' + PORT);
  console.log('📋 Admin panel: http://localhost:' + PORT + '/admin?key=' + ADMIN_KEY);
  console.log(EMAIL_USER ? '📧 Email notifications: ON' : '📧 Email notifications: OFF (.env setup karo)');
});