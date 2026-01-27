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

	try {
		const json = JSON.parse(txt);
		if (json?.message) return String(json.message);
	} catch {
		// ignore
	}

	return txt || 'Ukendt fejl';
}

async function loadUsers() {
	error.value = '';
	loading.value = true;

	try {
		const token = session.value?.accessToken;
		if (!token) {
			error.value = 'Du er ikke logget ind';
			return;
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

		// ✅ RETTELSE: API svarer { users: [...] }, ikke en array direkte
		users.value = (data?.users || []).filter(
			(u) => u.role !== 'COMPANY_ADMIN',
		);
	} catch (e) {
		error.value = e?.message || 'Kunne ikke hente brugere';
		users.value = [];
	} finally {
		loading.value = false;
	}
}

function goNew() {
	router.push('/admin/users/new');
}

function goEdit(id) {
	router.push(`/admin/users/${id}`);
}

async function deleteUser(id) {
	error.value = '';

	try {
		const token = session.value?.accessToken;
		if (!token) {
			error.value = 'Du er ikke logget ind';
			return;
		}

		const res = await apiFetch(`/admin/users/${id}`, {
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		if (!res.ok) {
			const msg = await readErrorMessage(res);
			throw new Error(msg);
		}

		await loadUsers();
	} catch (e) {
		error.value = e?.message || 'Kunne ikke slette bruger';
	}
}

onMounted(() => {
	if (!isCompanyAdmin.value) return;
	loadUsers();
});
</script>

<template>
	<div class="card">
		<h1 style="margin: 0 0 6px 0">Admin</h1>
		<p class="muted" style="margin: 0 0 16px 0">
			Brugere i din virksomhed (read-only)
		</p>

		<div v-if="!isCompanyAdmin" class="muted">
			Du har ikke adgang til denne side
		</div>

		<div v-else>
			<div
				style="
					display: flex;
					gap: 10px;
					align-items: center;
					flex-wrap: wrap;
				"
			>
				<button class="pill" style="cursor: pointer" @click="loadUsers">
					Opdater
				</button>

				<button class="pill" style="cursor: pointer" @click="goNew">
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
							<th style="text-align: left; padding: 8px 10px">
								Email
							</th>
							<th style="text-align: left; padding: 8px 10px">
								Rolle
							</th>
							<th style="text-align: left; padding: 8px 10px">
								Afdelingsleder
							</th>
							<th style="text-align: left; padding: 8px 10px">
								Leder
							</th>
							<th style="text-align: left; padding: 8px 10px">
								Handling
							</th>
						</tr>
					</thead>

					<tbody>
						<tr v-for="u in users" :key="u.id">
							<td style="padding: 8px 10px">{{ u.email }}</td>
							<td style="padding: 8px 10px">{{ u.role }}</td>
							<td style="padding: 8px 10px">
								{{ u.isDepartmentLeader ? 'Ja' : 'Nej' }}
							</td>
							<td style="padding: 8px 10px">
								{{ u.managerId ? 'Ja' : '-' }}
							</td>
							<td
								style="
									padding: 8px 10px;
									display: flex;
									gap: 10px;
								"
							>
								<button
									class="pill"
									style="cursor: pointer"
									@click="goEdit(u.id)"
								>
									Rediger
								</button>

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
