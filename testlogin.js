const fetch = require('node-fetch');
const API = 'http://localhost:5000/api';

async function test() {
  const res = await fetch(`${API}/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@memorial.test', password: 'adminpass123' })
  });
  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', data);
}

test();