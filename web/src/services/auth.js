import { ref, computed } from 'vue';

const KEY = 'tdtr_session';

function loadSession() {
	try {
		return JSON.parse(localStorage.getItem(KEY) || 'null');
	} catch {
		return null;
	}
}

export const session = ref(loadSession());
export const isLoggedIn = computed(() => !!session.value?.accessToken);

function save(s) {
	session.value = s;
	if (s) localStorage.setItem(KEY, JSON.stringify(s));
	else localStorage.removeItem(KEY);
}

// Gem både token + user
export function setAuth(accessToken, user) {
	save({ accessToken, ...user });
}

export function logout() {
	save(null);
}
