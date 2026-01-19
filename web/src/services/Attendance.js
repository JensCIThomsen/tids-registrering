import axios from 'axios';
import { logout } from './auth';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const KEY = 'tdtr_session';

function getTokenFromStorage() {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const s = JSON.parse(raw);
		return s?.accessToken || null;
	} catch {
		return null;
	}
}

function redirectToLogin() {
	logout();

	if (window.location.pathname !== '/login') {
		window.location.href = '/login';
	}
}

const api = axios.create({
	baseURL: apiBaseUrl,
	withCredentials: false,
});

api.interceptors.request.use((config) => {
	const token = getTokenFromStorage();

	// ✅ Hvis token mangler: redirect med det samme (ingen request)
	if (!token) {
		redirectToLogin();
		return Promise.reject(new axios.Cancel('No token'));
	}

	config.headers = config.headers || {};
	config.headers.Authorization = `Bearer ${token}`;

	return config;
});

api.interceptors.response.use(
	(res) => res,
	(err) => {
		const status = err?.response?.status;

		if (status === 401) {
			redirectToLogin();
		}

		return Promise.reject(err);
	},
);

export async function getStatus(userId) {
	const res = await api.get(`/attendance/status/${userId}`);
	return res.data;
}

export function moedT() {
	return api.post('/attendance/moedt');
}

export function gaaet() {
	return api.post('/attendance/gaaet');
}

export function today() {
	return api.get('/attendance/today');
}

export async function pauseStart() {
	return await api.post('/attendance/pause/start');
}

export async function pauseEnd() {
	return await api.post('/attendance/pause/end');
}
