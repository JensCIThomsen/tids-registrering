<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { session } from '../services/auth';
import { apiFetch } from '../services/api';

const router = useRouter();

const email = ref('');
const password = ref('');
const name = ref('');

const selectedRole = ref('EMPLOYEE');
const isDepartmentLeader = ref(false);
const managerId = ref('');

const loading = ref(false);
const errorMsg = ref('');

const role = computed(() => session.value?.role ?? null);
const accessToken = computed(() => session.value?.accessToken ?? '');
const companyId = computed(() => session.value?.companyId ?? '');
const companyName = ref('');

const isCompanyAdmin = computed(() => role.value === 'COMPANY_ADMIN');

const roleToCreate = computed(() => {
	// regler: COMPANY_ADMIN kan kun oprette EMPLOYEE
	if (isCompanyAdmin.value) return 'EMPLOYEE';
	return selectedRole.value;
});

const managers = ref([]);
const leaderOptions = computed(() => {
	return managers.value.filter((m) => m.isDepartmentLeader);
});

watch(isDepartmentLeader, (v) => {
	if (v) managerId.value = '';
});

onMounted(async () => {
	if (!isCompanyAdmin.value) {
		router.replace('/admin');
		return;
	}

	await loadCompany();
	await loadManagers();
});

async function loadCompany() {
	try {
		const token = accessToken.value;
		if (!token) return;

		const res = await apiFetch('/attendance/company', {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		if (!res.ok) {
			const txt = await res.text().catch(() => '');
			errorMsg.value =
				txt || `Kunne ikke hente virksomhed (HTTP ${res.status})`;
			return;
		}

		const data = await res.json();
		companyName.value = data?.name ? String(data.name) : '';
	} catch {
		// ignorer
	}
}

async function loadManagers() {
	try {
		const token = accessToken.value;
		if (!token) return;

		const res = await apiFetch('/attendance/employees', {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		if (!res.ok) {
			return;
		}

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
		// ignorer stille her
	}
}

async function submit() {
	errorMsg.value = '';

	if (!email.value.trim() || !password.value.trim() || !name.value.trim()) {
		errorMsg.value = 'Udfyld email, password og navn';
		return;
	}

	if (!accessToken.value) {
		errorMsg.value = 'Ingen token i session';
		return;
	}

	if (!companyId.value) {
		errorMsg.value = 'Ingen companyId i session';
		return;
	}

	loading.value = true;
	try {
		const payload = {
			email: email.value.trim().toLowerCase(),
			password: password.value,
			name: name.value.trim(),
			role: roleToCreate.value,
			companyId: companyId.value,

			isDepartmentLeader: isDepartmentLeader.value,
			managerId: managerId.value || null,
		};

		const res = await apiFetch('/admin/create-user', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${accessToken.value}`,
			},
			body: JSON.stringify(payload),
		});

		const data = await res.json().catch(() => ({}));

		if (!res.ok) {
			errorMsg.value = data?.message ?? 'Kunne ikke oprette bruger';
			return;
		}

		router.push('/admin');
	} catch (e) {
		errorMsg.value = e?.message ? String(e.message) : 'Netværksfejl';
	} finally {
		loading.value = false;
	}
}

function cancel() {
	router.push('/admin');
}
</script>

<template>
	<div class="card">
		<h1 style="margin: 0 0 12px 0">Opret bruger</h1>

		<p class="muted" style="margin-top: 0">
			Virksomhed sættes automatisk til din egen.
		</p>

		<div
			v-if="errorMsg"
			style="font-size: 13px; color: #ffb4b4; margin: 8px 0"
		>
			{{ errorMsg }}
		</div>

		<form
			@submit.prevent="submit"
			style="display: grid; gap: 12px; max-width: 520px"
		>
			<label style="display: grid; gap: 6px">
				<span style="font-weight: 600; font-size: 14px">Email</span>
				<input v-model="email" type="email" autocomplete="email" />
			</label>

			<label style="display: grid; gap: 6px">
				<span style="font-weight: 600; font-size: 14px">Password</span>
				<input
					v-model="password"
					type="password"
					autocomplete="new-password"
				/>
			</label>

			<label style="display: grid; gap: 6px">
				<span style="font-weight: 600; font-size: 14px">Navn</span>
				<input v-model="name" type="text" autocomplete="name" />
			</label>

			<label v-if="!isCompanyAdmin" style="display: grid; gap: 6px">
				<span style="font-weight: 600; font-size: 14px">Rolle</span>
				<select v-model="selectedRole">
					<option value="EMPLOYEE">EMPLOYEE</option>
					<option value="COMPANY_ADMIN">COMPANY_ADMIN</option>
				</select>
			</label>

			<label v-else style="display: grid; gap: 6px">
				<span style="font-weight: 600; font-size: 14px">Rolle</span>
				<input value="EMPLOYEE" type="text" disabled />
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
						{{ m.email }}<span v-if="m.name"> ({{ m.name }})</span
						><span v-if="m.isDepartmentLeader"> [leder]</span>
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

			<label style="display: grid; gap: 6px">
				<span style="font-weight: 600; font-size: 14px"
					>Virksomhed</span
				>
				<input :value="companyName || companyId" type="text" disabled />
			</label>

			<div style="display: flex; gap: 10px; align-items: center">
				<button
					class="pill"
					style="cursor: pointer"
					type="submit"
					:disabled="loading"
				>
					{{ loading ? 'Opretter...' : 'Opret' }}
				</button>

				<button
					class="pill"
					style="cursor: pointer"
					type="button"
					@click="cancel"
					:disabled="loading"
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
