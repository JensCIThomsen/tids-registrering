<script setup>
import { computed, onMounted, ref } from 'vue';
import { session } from '../services/auth';

const role = computed(() => session.value?.role || null);
const isCompanyAdmin = computed(() => role.value === 'COMPANY_ADMIN');

const loading = ref(false);
const error = ref('');
const users = ref([]);
const newEmail = ref('');
const newPassword = ref('secret123');

async function loadUsers() {
	error.value = '';
	loading.value = true;

	try {
		const token = session.value?.accessToken;
		if (!token) {
			throw new Error('Ingen token i session');
		}

		const res = await fetch('http://localhost:3000/attendance/employees', {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		if (!res.ok) {
			const txt = await res.text();
			throw new Error(txt || `HTTP ${res.status}`);
		}

		const data = await res.json();
		users.value = data.filter((u) => u.role !== 'COMPANY_ADMIN');
	} catch (e) {
		error.value = e?.message ? String(e.message) : String(e);
	} finally {
		loading.value = false;
	}
}

onMounted(() => {
	if (isCompanyAdmin.value) {
		loadUsers();
	}
});

async function createUser() {
	error.value = '';
	loading.value = true;

	try {
		const token = session.value?.accessToken;
		const companyId = session.value?.companyId;

		if (!token) throw new Error('Ingen token i session');
		if (!companyId) throw new Error('Ingen companyId i session');

		const email = newEmail.value.trim().toLowerCase();
		const password = newPassword.value;

		if (!email) throw new Error('Email mangler');
		if (!password) throw new Error('Password mangler');

		const res = await fetch('http://localhost:3000/admin/create-employee', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				companyId,
				email,
				password,
			}),
		});

		if (!res.ok) {
			const txt = await res.text();
			throw new Error(txt || `HTTP ${res.status}`);
		}

		newEmail.value = '';
		await loadUsers();
	} catch (e) {
		error.value = e?.message ? String(e.message) : String(e);
	} finally {
		loading.value = false;
	}
}

function roleLabel(r) {
	if (r === 'COMPANY_ADMIN') return 'Company Admin';
	if (r === 'EMPLOYEE') return 'Employee';
	if (r === 'SUPERADMIN') return 'Super Admin';
	return r || '';
}
</script>

<template>
	<div class="card">
		<h1 style="margin: 0 0 12px 0">Admin</h1>

		<div v-if="!isCompanyAdmin">
			<p>Ingen adgang.</p>
		</div>

		<div v-else>
			<p class="muted" style="margin-top: 0">
				Brugere i din virksomhed (read-only)
			</p>

			<div style="display: flex; gap: 10px; align-items: center">
				<button class="pill" style="cursor: pointer" @click="loadUsers">
					Opdater
				</button>
				<div class="card" style="margin-top: 12px">
					<div
						style="
							display: flex;
							gap: 10px;
							flex-wrap: wrap;
							align-items: center;
						"
					>
						<input
							v-model="newEmail"
							class="pill"
							style="
								min-width: 260px;
								color: #fff;
								background: #111;
							"
							placeholder="email (fx emp2@test.dk)"
						/>

						<input
							v-model="newPassword"
							class="pill"
							style="
								min-width: 180px;
								color: #fff;
								background: #111;
							"
							placeholder="password"
						/>

						<button
							class="pill"
							style="cursor: pointer"
							@click="createUser"
						>
							Opret bruger
						</button>
					</div>
				</div>

				<span v-if="loading" class="muted" style="font-size: 13px">
					Henter...
				</span>

				<span v-if="error" style="font-size: 13px; color: #ffb4b4">
					{{ error }}
				</span>
			</div>

			<div style="margin-top: 14px; overflow: auto">
				<table style="width: 100%; border-collapse: collapse">
					<thead>
						<tr>
							<th
								style="
									text-align: left;
									padding: 8px;
									border-bottom: 1px solid #333;
								"
							>
								Email
							</th>
							<th
								style="
									text-align: left;
									padding: 8px;
									border-bottom: 1px solid #333;
								"
							>
								Rolle
							</th>
							<th
								style="
									text-align: left;
									padding: 8px;
									border-bottom: 1px solid #333;
								"
							>
								Afdelingsleder
							</th>
							<th
								style="
									text-align: left;
									padding: 8px;
									border-bottom: 1px solid #333;
								"
							>
								Leder
							</th>
						</tr>
					</thead>

					<tbody>
						<tr v-for="u in users" :key="u.id">
							<td
								style="
									padding: 8px;
									border-bottom: 1px solid #222;
								"
							>
								{{ u.email }}
							</td>

							<td
								style="
									padding: 8px;
									border-bottom: 1px solid #222;
								"
							>
								{{ roleLabel(u.role) }}
							</td>

							<td
								style="
									padding: 8px;
									border-bottom: 1px solid #222;
								"
							>
								<span v-if="u.isDepartmentLeader">Ja</span>
								<span v-else class="muted">Nej</span>
							</td>

							<td
								style="
									padding: 8px;
									border-bottom: 1px solid #222;
								"
							>
								<span v-if="u.manager?.email">{{
									u.manager.email
								}}</span>
								<span v-else class="muted">—</span>
							</td>
						</tr>

						<tr v-if="!loading && users.length === 0">
							<td colspan="4" class="muted" style="padding: 10px">
								Ingen brugere fundet
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	</div>
</template>
