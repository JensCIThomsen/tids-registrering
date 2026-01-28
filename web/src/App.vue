<script setup>
import { computed } from 'vue';
import { isLoggedIn, logout, session } from './services/auth';
import { useRoute, useRouter } from 'vue-router';
import logo from './assets/logo-full.svg';

const route = useRoute();
const router = useRouter();

const role = computed(() => session.value?.role || null);

function isActive(path) {
	return route.path === path;
}

async function onLogout() {
	logout();
	await router.push('/login');
}
</script>

<template>
	<div>
		<nav class="navbar">
			<div class="navbar-inner">
				<div class="brand">
					<img
						:src="logo"
						alt="Trisect Development Tids-Registrering"
						style="height: 42px"
					/>
				</div>

				<div class="nav">
					<router-link
						class="pill"
						:class="{ active: isActive('/') }"
						to="/"
					>
						Forside
					</router-link>

					<router-link
						v-if="
							isLoggedIn &&
							(role === 'COMPANY_ADMIN' || role === 'EMPLOYEE')
						"
						class="pill"
						:class="{ active: isActive('/attendance') }"
						to="/attendance"
					>
						Attendance
					</router-link>

					<router-link
						v-if="isLoggedIn && role === 'COMPANY_ADMIN'"
						class="pill"
						:class="{ active: isActive('/company-today') }"
						to="/company-today"
					>
						I dag
					</router-link>

					<!-- NYT menupunkt -->
					<router-link
						v-if="isLoggedIn && role === 'COMPANY_ADMIN'"
						class="pill"
						:class="{ active: isActive('/week') }"
						to="/week"
					>
						Uge
					</router-link>

					<router-link
						v-if="isLoggedIn && role === 'SUPERADMIN'"
						class="pill"
						:class="{ active: isActive('/admin') }"
						to="/admin"
					>
						Super Admin
					</router-link>

					<router-link
						v-if="isLoggedIn && role === 'COMPANY_ADMIN'"
						class="pill"
						:class="{ active: isActive('/admin') }"
						to="/admin"
					>
						Admin
					</router-link>
				</div>

				<div class="spacer"></div>

				<div v-if="!isLoggedIn">
					<router-link
						class="pill"
						style="cursor: pointer"
						:class="{ active: isActive('/login') }"
						to="/login"
					>
						Log ind
					</router-link>
				</div>

				<div v-else>
					<button
						class="pill"
						style="cursor: pointer"
						@click="onLogout"
					>
						Logud
					</button>
				</div>
			</div>
		</nav>

		<main class="container">
			<router-view />
		</main>
	</div>
</template>
