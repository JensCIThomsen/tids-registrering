export const API_BASE =
	import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export async function apiFetch(path, options = {}) {
	const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
	return fetch(url, options);
}
