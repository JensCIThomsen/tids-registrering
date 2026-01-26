<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { session } from '../services/auth';
import { apiFetch } from '../services/api';

const route = useRoute();
const router = useRouter();

const userId = computed(() => String(route.params.id || ''));

const loading = ref(false);
const saving = ref(false);
const errorMsg = ref('');

const role = computed(() => session.value?.role ?? null);
const accessToken = computed(() => session.value?.accessToken ?? '');
const isCompanyAdmin = computed(() => role.value === 'COMPANY_ADMIN');

const email = ref('');
const name = ref('');
const isDepartmentLeader = ref(false);
const managerId = ref('');

const managers = ref([]);
const leaderOptions = computed(() => {
	return managers.value.filter(
		(m) => m.isDepartmentLeader && m.id !== userId.value,
	);
});

watch(isDepartmentLeader, (v) => {
	if (v) managerId.value = '';
});

onMounted(async () => {
	if (!isCompanyAdmin.value) {
		router.replace('/admin');
		return;
	}

	await loadManagers();
	await loadUser();
});

async function loadManagers() {
	try {
		const token = accessToken.value;
		if (!token) return;

		const res = await apiFetch('/attendance/employees', {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		if (!res.ok) return;

		const data = await res.json();

		managers.value = (Array.isArray(data) ? data : [])
			.filter((u) => u && u.id)
			.map((u) => ({
				id: u.id,
				email: u.email,
				name: u.name,
				isDepartmentLeader: !!u.isDepartmentLeader,
			}));
	} catch {
		// ignorer
	}
}

async function loadUser() {
	errorMsg.value = '';
	loading.value = true;

	try {
		const token = accessToken.value;
		if (!token) throw new Error('Ingen token i session');

		const res = await apiFetch(`/admin/users/${userId.value}`, {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		const data = await res.json().catch(() => ({}));

		if (!res.ok) {
			errorMsg.value =
				data?.message ?? `Kunne ikke hente bruger (HTTP ${res.status})`;
			return;
		}

		email.value = data?.email ? String(data.email) : '';
		name.value = data?.name ? String(data.name) : '';
		isDepartmentLeader.value = !!data?.isDepartmentLeader;
		managerId.value = data?.managerId ? String(data.managerId) : '';
	} catch (e) {
		errorMsg.value = e?.message ? String(e.message) : 'Netværksfejl';
	} finally {
		loading.value = false;
	}
}

async function save() {
	errorMsg.value = '';
	saving.value = true;

	try {
		const token = accessToken.value;
		if (!token) throw new Error('Ingen token i session');

		const res = await apiFetch(`/admin/users/${userId.value}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				name: name.value.trim(),
				isDepartmentLeader: isDepartmentLeader.value,
				managerId: managerId.value || null,
			}),
		});

		const data = await res.json().catch(() => ({}));

		if (!res.ok) {
			errorMsg.value =
				data?.message ?? `Kunne ikke gemme (HTTP ${res.status})`;
			return;
		}

		router.push('/admin');
	} catch (e) {
		errorMsg.value = e?.message ? String(e.message) : 'Netværksfejl';
	} finally {
		saving.value = false;
	}
}

function cancel() {
	router.push('/admin');
}
</script>

<template>
	<div class="card">
		<h1 style="margin: 0 0 12px 0">Rediger bruger</h1>

		<p class="muted" style="margin-top: 0">Bruger-id: {{ userId }}</p>

		<div v-if="loading" class="muted" style="font-size: 13px">
			Henter...
		</div>

		<div
			v-if="errorMsg"
			style="font-size: 13px; color: #ffb4b4; margin: 8px 0"
		>
			{{ errorMsg }}
		</div>

		<form
			v-if="!loading"
			@submit.prevent="save"
			style="display: grid; gap: 12px; max-width: 520px"
		>
			<label style="display: grid; gap: 6px">
				<span style="font-weight: 600; font-size: 14px">Email</span>
				<input v-model="email" type="text" disabled />
			</label>

			<label style="display: grid; gap: 6px">
				<span style="font-weight: 600; font-size: 14px">Navn</span>
				<input v-model="name" type="text" autocomplete="name" />
			</label>

			<label style="display: flex; gap: 10px; align-items: center">
				<input v-model="isDepartmentLeader" type="checkbox" />
				<span style="font-weight: 600; font-size: 14px"
					>Afdelingsleder</span
				>
			</label>

			<label style="display: grid; gap: 6px">
				<span style="font-weight: 600; font-size: 14px">Leder</span>

				<p
					v-if="leaderOptions.length === 0"
					class="muted"
					style="margin: 0; font-size: 13px"
				>
					Ingen afdelingsledere endnu – du kan oprette en først.
				</p>

				<select v-model="managerId" :disabled="isDepartmentLeader">
					<option value="">— ingen —</option>
					<option
						v-for="m in leaderOptions"
						:key="m.id"
						:value="m.id"
					>
						{{ m.email }}<span v-if="m.name"> ({{ m.name }})</span>
					</option>
				</select>

				<p
					v-if="isDepartmentLeader"
					class="muted"
					style="margin: 0; font-size: 13px"
				>
					Afdelingsleder kan ikke have en leder.
				</p>
			</label>

			<div style="display: flex; gap: 10px; align-items: center">
				<button
					class="pill"
					style="cursor: pointer"
					type="submit"
					:disabled="saving"
				>
					{{ saving ? 'Gemmer...' : 'Gem' }}
				</button>

				<button
					class="pill"
					style="cursor: pointer"
					type="button"
					@click="cancel"
					:disabled="saving"
				>
					Annuller
				</button>
			</div>
		</form>
	</div>
</template>

<style scoped>
input,
select {
	padding: 10px 12px;
	border-radius: 10px;
	border: 1px solid #555;
	background: #fff;
	color: #000;
	outline: none;
}

input:focus,
select:focus {
	border-color: #9ecbff;
	box-shadow: 0 0 0 2px rgba(158, 203, 255, 0.35);
}

.muted {
	opacity: 0.75;
}

select:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}
</style>
