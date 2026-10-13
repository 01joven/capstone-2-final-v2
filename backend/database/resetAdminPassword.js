const readline = require('readline');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const promptHidden = (prompt) => new Promise((resolve, reject) => {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    reject(new Error('Run this command in an interactive terminal so the password can be entered privately.'));
    return;
  }

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write(prompt);
  let value = '';

  const cleanup = () => {
    process.stdin.removeListener('keypress', onKeypress);
    process.stdin.setRawMode(false);
    process.stdout.write('\n');
  };
  const onKeypress = (character, key = {}) => {
    if (key.ctrl && key.name === 'c') {
      cleanup();
      reject(new Error('Password reset cancelled.'));
      return;
    }
    if (key.name === 'return' || key.name === 'enter') {
      cleanup();
      resolve(value);
      return;
    }
    if (key.name === 'backspace') {
      if (value.length > 0) {
        value = value.slice(0, -1);
        process.stdout.write('\b \b');
      }
      return;
    }
    if (typeof character === 'string' && character.length === 1 && !key.ctrl && !key.meta) {
      value += character;
      process.stdout.write('*');
    }
  };

  process.stdin.on('keypress', onKeypress);
});

const resetAdminPassword = async () => {
  const email = typeof process.argv[2] === 'string' ? process.argv[2].trim().toLowerCase() : '';
  if (process.argv[3] !== '--verified-authorized' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Usage: npm run admin:reset-password -- admin@example.com --verified-authorized');
  }

  const password = await promptHidden('New administrator password: ');
  const confirmation = await promptHidden('Confirm new administrator password: ');
  if (password.length < 12) {
    throw new Error('Administrator passwords must be at least 12 characters.');
  }
  if (password !== confirmation) {
    throw new Error('Passwords do not match.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    `UPDATE users
     SET password_hash = $1, auth_version = auth_version + 1
     WHERE LOWER(email) = $2 AND role = 'admin'
     RETURNING email`,
    [passwordHash, email]
  );
  if (result.rows.length === 0) {
    throw new Error('No administrator account exists with that email.');
  }

  console.log(`Password reset for ${result.rows[0].email}. Existing sessions have been revoked.`);
};

resetAdminPassword()
  .catch((error) => {
    console.error('Administrator password reset failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
