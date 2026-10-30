function resolveAddress(input) {
  const value = String(input || '').trim();
  if (!value || value === 'nocturne://home') return null;
  if (/^https?:\/\//i.test(value)) return new URL(value).href;
  if (/^(localhost|[\w-]+(?:\.[\w-]+)+)(:\d+)?([/?#].*)?$/.test(value)) return new URL('https://' + value).href;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) throw new Error('Этот протокол не поддерживается');
  return 'https://www.google.com/search?q=' + encodeURIComponent(value);
}
module.exports = { resolveAddress };
