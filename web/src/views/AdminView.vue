<script setup>
import { computed, onMounted, ref } from 'vue';
import { session } from '../services/auth';
import { useRouter } from 'vue-router';
import { apiFetch } from '../services/api';

const role = computed(() => session.value?.role || null);
const isCompanyAdmin = computed(() => role.value === 'COMPANY_ADMIN');

const loading = ref(false);
const error = ref('');
const users = ref([]);
const router = useRouter();

async function readErrorMessage(res) {
	const txt = await res.text().catch(() => '');
	if (!txt) return `HTTP ${res.status}`;

	try {
		const j = JSON.parse(txt);
		if (j && typeof j.message === 'string') return j.message;
		if (j && Array.isArray(j.message)) return j.message.join(', ');
	} catch {
		// ignore
	}

	return txt;
}

async function loadUsers() {
	error.value = '';
	loading.value = true;

	try {
		const token = session.value?.accessToken;
		if (!token) {
			throw new Error('Ingen token i session');
		}

		const res = await apiFetch('/attendance/employees', {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		if (!res.ok) {
			const msg = await readErrorMessage(res);
			throw new Error(msg);
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

function goEditUser(id) {
	router.push({ name: 'admin-user-edit', params: { id } });
}

function goCreateUser() {
	router.push({ name: 'admin-user-new' });
	// alternativt (samme effekt): router.push('/admin/users/new')
}

function roleLabel(r) {
	if (r === 'COMPANY_ADMIN') return 'Company Admin';
	if (r === 'EMPLOYEE') return 'Employee';
	if (r === 'SUPERADMIN') return 'Super Admin';
	return r || '';
}

async function deleteUser(userId) {
	error.value = '';
	loading.value = true;

	try {
		const token = session.value?.accessToken;
		if (!token) throw new Error('Ingen token i session');

		const ok = window.confirm('Er du sikker på at du vil slette brugeren?');
		if (!ok) return;

		const res = await apiFetch(`/admin/users/${userId}`, {
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		if (!res.ok) {
			const txt = await res.text();
			try {
				const j = JSON.parse(txt);
				throw new Error(j.message || 'Fejl ved sletning');
			} catch {
				throw new Error(txt || 'Fejl ved sletning');
			}
		}

		await loadUsers();
	} catch (e) {
		let msg = e?.message ?? 'Ukendt fejl';

		// hvis backend-fejl er JSON som string → parse og vis kun message
		if (typeof msg === 'string' && msg.trim().startsWith('{')) {
			try {
				const j = JSON.parse(msg);
				if (j?.message) msg = j.message;
			} catch {
				// ignore
			}
		}

		error.value = msg;
	} finally {
		loading.value = false;
	}
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

				<button
					class="pill"
					style="cursor: pointer"
					@click="goCreateUser"
				>
					Opret bruger
				</button>

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
							<th
								style="
									text-align: left;
									padding: 8px;
									border-bottom: 1px solid #333;
								"
							>
								Handling
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
							<td
								style="
									padding: 8px;
									border-bottom: 1px solid #222;
									white-space: nowrap;
								"
							>
								<button
									class="pill"
									style="cursor: pointer"
									@click="goEditUser(u.id)"
								>
									Rediger</button
								>&nbsp;
								<button
									class="pill"
									style="cursor: pointer"
									@click="deleteUser(u.id)"
								>
									Slet
								</button>
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
