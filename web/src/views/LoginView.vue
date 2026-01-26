<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import logo from '../assets/logo-full.svg';
import { setAuth } from '../services/auth';
import { apiFetch } from '../services/api';

const router = useRouter();

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function onLogin() {
	error.value = '';
	loading.value = true;

	try {
		const res = await apiFetch('/auth/login', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				email: email.value,
				password: password.value,
			}),
		});

		const data = await res.json();

		if (!res.ok) {
			error.value = data.message || 'Login fejlede';
			return;
		}

		setAuth(data.accessToken, data.user);
		//debugger;

		if (
			data.user.role === 'SUPERADMIN' ||
			data.user.role === 'COMPANY_ADMIN'
		) {
			await router.push('/admin');
		} else {
			await router.push('/attendance');
		}
	} catch {
		error.value = 'Kunne ikke forbinde til serveren';
	} finally {
		loading.value = false;
	}
}
</script>

<template>
	<div style="max-width: 420px; margin: 60px auto">
		<div class="card" style="text-align: center">
			<img
				:src="logo"
				alt="Trisect Development Tids-Registrering"
				style="height: 120px; margin-bottom: 18px"
			/>

			<h1 style="margin: 0 0 6px 0">Login</h1>

			<input
				class="input"
				type="email"
				v-model="email"
				placeholder="Email"
				style="margin-bottom: 10px"
			/>

			<input
				class="input"
				type="password"
				v-model="password"
				placeholder="Password"
				@keydown.enter="onLogin"
			/>

			<button
				type="button"
				class="btn btn-primary"
				style="width: 100%; margin-top: 12px"
				:disabled="loading"
				@click="onLogin"
			>
				Log ind
			</button>

			<p v-if="error" class="error" style="margin-top: 12px">
				{{ error }}
			</p>
		</div>
	</div>
</template>
