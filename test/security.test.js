const test = require('node:test');
const assert = require('node:assert/strict');
const { app, authorized, safeFilename } = require('../index.js');

test('rejects requests without configured secret', async () => {
  const previous = process.env.PDF_SERVICE_SECRET;
  delete process.env.PDF_SERVICE_SECRET;
  const server = app.listen(0);
  try {
    const port = server.address().port;
    const response = await fetch('http://127.0.0.1:' + port + '/generate-pdf', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: '<h1>Test</h1>' }),
    });
    assert.equal(response.status, 503);
  } finally {
    server.close();
    if (previous) process.env.PDF_SERVICE_SECRET = previous;
  }
});

test('rejects invalid secret and oversized bodies', async () => {
  process.env.PDF_SERVICE_SECRET = '0123456789abcdef0123456789abcdef';
  const server = app.listen(0);
  try {
    const port = server.address().port;
    const response = await fetch('http://127.0.0.1:' + port + '/generate-pdf', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-pdf-secret': 'wrong' },
      body: JSON.stringify({ html: '<h1>Test</h1>' }),
    });
    assert.equal(response.status, 403);
    const large = await fetch('http://127.0.0.1:' + port + '/generate-pdf', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-pdf-secret': '0123456789abcdef0123456789abcdef' },
      body: JSON.stringify({ html: 'a'.repeat(450000) }),
    });
    assert.equal(large.status, 413);
  } finally {
    server.close();
    delete process.env.PDF_SERVICE_SECRET;
  }
});

test('sanitizes output filenames', () => {
  assert.equal(safeFilename('../../hi\r\nBad:name.pdf'), 'hiBadname.pdf');
  assert.equal(safeFilename(undefined), 'zertainity-results.pdf');
});
