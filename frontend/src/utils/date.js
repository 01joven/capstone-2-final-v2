// Today's date (YYYY-MM-DD) in the cemetery's timezone, matching the server's check.
export const todayInManila = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
