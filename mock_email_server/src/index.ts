import express from 'express';

interface StoredEmail {
  to: string;
  subject: string;
  link: string;
  receivedAt: string;
}

const app = express();
let emails: StoredEmail[] = [];

app.use(express.json());

// Middleware to log access details
app.use((req, res, next) => {
  if (req.url !== '/health') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  }
  next();
});

app.post('/reset', (req, res) => {
  emails = [];
  res.status(200).json({ status: 'ok', message: 'Reset complete' });
});

app.post('/send', (req, res) => {
  const { to, subject, link } = req.body ?? {};

  if (!to || !link) {
    res.status(400).json({ error: 'Both "to" and "link" are required' });
    return;
  }

  emails = [
    { to, subject: subject ?? '', link, receivedAt: new Date().toISOString() },
    ...emails,
  ];
  res.status(200).json({ status: 'ok' });
});

// Returns stored emails, newest first, optionally filtered by recipient.
app.get('/messages', (req, res) => {
  const to = req.query.to;
  const result =
    typeof to === 'string' ? emails.filter((email) => email.to === to) : emails;
  res.status(200).json(result);
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

const PORT = process.env.PORT ?? 3055;
app.listen(PORT, () => {
  console.log(`Mock email server is running on port ${PORT}`);
});
