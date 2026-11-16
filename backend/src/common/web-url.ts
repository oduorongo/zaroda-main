// The Zaroda School website people open (links in emails, invoices and invites).
// Not APP_URL: that one is where M-Pesa/Tuma callbacks reach the backend.
export const webUrl = () => (process.env.SCHOOL_WEB_URL || 'https://zarodaschool.com').replace(/\/+$/, '');
