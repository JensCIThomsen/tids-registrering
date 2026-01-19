<script setup>
import { computed, onMounted, ref } from 'vue';
import { session } from '../services/auth';

const users = ref([]);
const loading = ref(true);
const error = ref('');

const creating = ref(false);
const createEmail = ref('');
const createPassword = ref('');
const createError = ref('');
const createOk = ref('');

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const companyId = computed(() => session.value?.companyId || '');

async function loadUsers() {
	loading.value = true;
	error.value = '';

	try {
		if (!companyId.value) {
			error.value = 'Mangler companyId i session';
			return;
		}

		const res = await fetch(
			`${apiBaseUrl}/admin/employees/${companyId.value}`,
		);
		const data = await res.json();

		if (!res.ok) {
			error.value = data.message || 'Kunne ikke hente brugere';
			return;
		}

		users.value = data.users || [];
	} catch {
		error.value = 'Kunne ikke forbinde til serveren';
	} finally {
		loading.value = false;
	}
}

function roleLabel(role) {
	if (role === 'COMPANY_ADMIN') return 'Virksomheds-admin';
	if (role === 'EMPLOYEE') return 'Medarbejder';
	if (role === 'SUPERADMIN') return 'Superadmin';
	return role || '';
}

async function createEmployee() {
	createError.value = '';
	createOk.value = '';
	creating.value = true;

	try {
		const email = createEmail.value.trim().toLowerCase();
		const password = createPassword.value;

		if (!companyId.value) {
			createError.value = 'Mangler companyId i session';
			return;
		}
		if (!email) {
			createError.value = 'Email mangler';
			return;
		}
		if (!password) {
			createError.value = 'Password mangler';
			return;
		}

		const res = await fetch(`${apiBaseUrl}/admin/create-employee`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				companyId: companyId.value,
				email,
				password,
			}),
		});

		const data = await res.json();

		if (!res.ok) {
			createError.value =
				data.message || 'Kunne ikke oprette medarbejder';
			return;
		}

		createOk.value = 'Medarbejder oprettet';
		createEmail.value = '';
		createPassword.value = '';

		await loadUsers();
	} catch {
		createError.value = 'Kunne ikke forbinde til serveren';
	} finally {
		creating.value = false;
	}
}

onMounted(loadUsers);
</script>

<template>
	<div class="card">
		<h1 style="margin: 0 0 10px 0">Virksomhed – Brugere</h1>

		<div class="card" style="margin-bottom: 16px">
			<h2 style="margin: 0 0 10px 0; font-size: 18px">
				Opret medarbejder
			</h2>

			<div
				style="
					display: grid;
					gap: 10px;
					grid-template-columns: 1fr 1fr;
					align-items: end;
				"
			>
				<div>
					<label
						class="muted"
						style="display: block; margin-bottom: 6px"
						>Email</label
					>
					<input
						class="input"
						type="email"
						v-model="createEmail"
						placeholder="fx emp2@test.dk"
					/>
				</div>

				<div>
					<label
						class="muted"
						style="display: block; margin-bottom: 6px"
						>Password</label
					>
					<input
						class="input"
						type="password"
						v-model="createPassword"
						placeholder="Password"
					/>
				</div>
			</div>

			<div
				style="
					margin-top: 10px;
					display: flex;
					gap: 10px;
					align-items: center;
				"
			>
				<button
					class="btn btn-primary"
					:disabled="creating"
					@click="createEmployee"
				>
					Opret
				</button>

				<button
					class="pill"
					style="cursor: pointer"
					:disabled="creating"
					@click="loadUsers"
				>
					Opdater liste
				</button>
			</div>

			<p v-if="createError" class="error" style="margin-top: 10px">
				{{ createError }}
			</p>
			<p v-if="createOk" class="muted" style="margin-top: 10px">
				{{ createOk }}
			</p>
		</div>

		<div v-if="loading" class="muted">Henter...</div>
		<div v-else-if="error" class="error">{{ error }}</div>

		<table v-else class="table" style="width: 100%">
			<thead>
				<tr>
					<th style="text-align: left">UserId</th>
					<th style="text-align: left">Email</th>
					<th style="text-align: left">Rolle</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="u in users" :key="u.id">
					<td
						style="
							font-family:
								ui-monospace, SFMono-Regular, Menlo, Monaco,
								Consolas, 'Liberation Mono', 'Courier New',
								monospace;
							font-size: 12px;
						"
					>
						{{ u.id }}
					</td>
					<td>{{ u.email }}</td>
					<td>{{ roleLabel(u.role) }}</td>
				</tr>
			</tbody>
		</table>
	</div>
</template>
