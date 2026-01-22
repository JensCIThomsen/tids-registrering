import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import AttendanceView from '../views/AttendanceView.vue';
import LoginView from '../views/LoginView.vue';
import AdminView from '../views/AdminView.vue';
import CompanyAdminView from '../views/CompanyAdminView.vue';
import CompanyTodayView from '../views/CompanyTodayView.vue';

import { session, logout } from '../services/auth';

const KEY = 'tdtr_session';

function hasValidStoredSession() {
	const raw = localStorage.getItem(KEY);
	if (!raw) return false;

	try {
		const s = JSON.parse(raw);
		return !!s?.accessToken;
	} catch {
		return false;
	}
}

const router = createRouter({
	history: createWebHistory(),
	routes: [
		{ path: '/', name: 'home', component: HomeView },
		{ path: '/login', name: 'login', component: LoginView },

		{
			path: '/attendance',
			name: 'attendance',
			component: AttendanceView,
			meta: { requiresAuth: true, roles: ['COMPANY_ADMIN', 'EMPLOYEE'] },
		},

		{
			path: '/company-admin',
			name: 'company-admin',
			component: CompanyAdminView,
			meta: { requiresAuth: true, roles: ['COMPANY_ADMIN'] },
		},

		{
			path: '/company-today',
			name: 'company-today',
			component: CompanyTodayView,
			meta: { requiresAuth: true, roles: ['COMPANY_ADMIN'] },
		},

		{
			path: '/admin',
			name: 'admin',
			component: AdminView,
			meta: {
				requiresAuth: true,
				roles: ['SUPERADMIN', 'COMPANY_ADMIN'],
			},
		},
	],
});

router.beforeEach((to) => {
	// Kun protected routes tjekkes
	if (to.meta?.requiresAuth) {
		// ✅ Failsafe: hvis localStorage mangler/er korrupt → smid til login
		if (!hasValidStoredSession()) {
			logout();
			return { path: '/login', query: { redirect: to.fullPath } };
		}

		// Normal auth-check
		const s = session.value;
		const isAuthed = !!s;

		if (!isAuthed) {
			return { path: '/login', query: { redirect: to.fullPath } };
		}

		// Role-check
		const roles = to.meta?.roles;
		if (roles && roles.length) {
			const role = s?.role;

			if (!role || !roles.includes(role)) {
				return { path: '/login', query: { redirect: to.fullPath } };
			}
		}
	}

	return true;
});

export default router;
