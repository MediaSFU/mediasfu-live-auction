const API = import.meta.env.VITE_AUCTION_API_URL || '';
export async function request(path, { token, ...options } = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } });
  let value;
  try { value = await response.json(); } catch { value = { success: false, error: 'The auction service returned an unreadable response.' }; }
  if (!response.ok || value.success === false) { const error = new Error(value.error || 'Request failed.'); error.status = response.status; throw error; }
  return value;
}
