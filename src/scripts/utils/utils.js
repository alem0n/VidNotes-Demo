// VidNotes shared utilities: pure helpers, no DOM dependencies.
export const pad = (n) => String(n).padStart(2, "0");
export const clockOf = (ms) => pad(Math.floor(ms / 60000)) + ":" + pad(Math.floor((ms % 60000) / 1000));
export const fmtTokens = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : n);
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function rand(a, b) { return a + Math.random() * (b - a); }
