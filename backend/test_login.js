const http = require('http');

const data = JSON.stringify({email: 'admin@cemetery.gov', password: 'password123'});

const req = http.request('http://localhost:5000/api/auth/admin/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, (res) => {
  let responseData = '';
  res.on('data', (chunk) => { responseData += chunk; });
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Response:', responseData);
  });
});

req.write(data);
req.end();