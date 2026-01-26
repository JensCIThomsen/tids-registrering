<script setup>
import { onMounted, ref } from 'vue';
import { session } from '../services/auth';
import { apiFetch } from '../services/api';

const users = ref([]);
const loading = ref(true);
const error = ref('');

async function loadUsers() {
	loading.value = true;
	error.value = '';

	try {
		const token = session.value?.accessToken;
		if (!token) {
			error.value = 'Ingen token i session';
			return;
		}

		const res = await apiFetch('/attendance/employees', {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		const data = await res.json();

		if (!res.ok) {
			error.value = data?.message || 'Kunne ikke hente brugere';
			return;
		}

		users.value = Array.isArray(data) ? data : data.users || [];
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

onMounted(loadUsers);
</script>

<template>
	<div class="card">
		<h1 style="margin: 0 0 10px 0">Virksomhed – Brugere</h1>

		<div
			style="
				display: flex;
				gap: 10px;
				align-items: center;
				margin-bottom: 12px;
			"
		>
			<button
				class="pill"
				style="cursor: pointer"
				:disabled="loading"
				@click="loadUsers"
			>
				Opdater liste
			</button>

			<span v-if="loading" class="muted" style="font-size: 13px"
				>Henter...</span
			>
			<span v-if="error" class="error" style="font-size: 13px">{{
				error
			}}</span>
		</div>

		<table v-if="!loading && !error" class="table" style="width: 100%">
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
