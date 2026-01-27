<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { apiFetch } from '../services/api';
import { session } from '../services/auth';

const router = useRouter();

const loading = ref(false);
const errorMsg = ref('');

const email = ref('');
const password = ref('');
const name = ref('');

// virksomhed
const companyId = ref('');
const companyName = ref('');

// leder/afdelingsleder
const isDepartmentLeader = ref(false);
const managerId = ref('');
const employees = ref([]);

const leaderOptions = computed(() => {
	// kun afdelingsledere
	return employees.value.filter((u) => u.isDepartmentLeader);
});

watch(isDepartmentLeader, (v) => {
	// afdelingsleder kan ikke have en leder
	if (v) managerId.value = '';
});

// arbejdsregler (defaults)
const weeklyHours = ref('37');
const breakMinutesPerDay = ref('30');
const breakIsPaid = ref(false);

onMounted(async () => {
	await loadCompany();
	await loadEmployees();
});

async function loadCompany() {
	errorMsg.value = '';

	try {
		const token = session.value?.accessToken;
		if (!token) {
			errorMsg.value = 'Du er ikke logget ind';
			return;
		}

		const res = await apiFetch('/attendance/company', {
			headers: { Authorization: `Bearer ${token}` },
		});

		const data = await res.json().catch(() => ({}));

		if (!res.ok) {
			errorMsg.value =
				data?.message ??
				`Kunne ikke hente virksomhed (HTTP ${res.status})`;
			return;
		}

		companyId.value = data?.company?.id || '';
		companyName.value = data?.company?.name || '';
	} catch (e) {
		errorMsg.value = e?.message ? String(e.message) : 'Netværksfejl';
	}
}

async function loadEmployees() {
	try {
		const token = session.value?.accessToken;
		if (!token) return;

		const res = await apiFetch('/attendance/employees', {
			headers: { Authorization: `Bearer ${token}` },
		});

		const data = await res.json().catch(() => ({}));

		if (!res.ok) {
			return;
		}

		employees.value = Array.isArray(data?.users) ? data.users : [];
	} catch {
		employees.value = [];
	}
}

async function save() {
	errorMsg.value = '';
	loading.value = true;

	try {
		const token = session.value?.accessToken;
		if (!token) throw new Error('Ingen token i session');

		const res = await apiFetch('/admin/create-user', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				email: email.value.trim(),
				password: password.value,
				name: name.value.trim(),
				role: 'EMPLOYEE',
				companyId: companyId.value,

				isDepartmentLeader: isDepartmentLeader.value,
				managerId: managerId.value || null,

				weeklyHours: weeklyHours.value,
				breakMinutesPerDay: breakMinutesPerDay.value,
				breakIsPaid: breakIsPaid.value,
			}),
		});

		const data = await res.json().catch(() => ({}));

		if (!res.ok) {
			errorMsg.value = data?.message ?? `Kunne ikke oprette bruger`;
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

		<div
			v-if="errorMsg"
			style="font-size: 13px; color: #ffb4b4; margin-bottom: 10px"
		>
			{{ errorMsg }}
		</div>

		<form
			@submit.prevent="save"
			style="display: grid; gap: 14px; max-width: 520px"
		>
			<label style="display: grid; gap: 6px">
				<span style="font-weight: 600">Email</span>
				<input v-model="email" required />
			</label>

			<label style="display: grid; gap: 6px">
				<span style="font-weight: 600">Adgangskode</span>
				<input v-model="password" type="password" required />
			</label>

			<label style="display: grid; gap: 6px">
				<span style="font-weight: 600">Navn</span>
				<input v-model="name" />
			</label>

			<label style="display: grid; gap: 6px">
				<span style="font-weight: 600">Virksomhed</span>
				<input :value="companyName" disabled />
			</label>

			<hr
				style="
					border: 0;
					border-top: 1px solid rgba(255, 255, 255, 0.12);
				"
			/>

			<h2 style="margin: 0; font-size: 16px">Leder</h2>

			<label style="display: flex; gap: 10px; align-items: center">
				<input v-model="isDepartmentLeader" type="checkbox" />
				<span style="font-weight: 600">Afdelingsleder</span>
			</label>

			<label style="display: grid; gap: 6px">
				<span style="font-weight: 600">Leder</span>
				<select v-model="managerId" :disabled="isDepartmentLeader">
					<option value="">Ingen</option>
					<option
						v-for="u in leaderOptions"
						:key="u.id"
						:value="u.id"
					>
						{{ u.name || u.email }}
					</option>
				</select>

				<p v-if="isDepartmentLeader" class="muted" style="margin: 0">
					Afdelingsleder kan ikke have en leder.
				</p>
			</label>

			<hr
				style="
					border: 0;
					border-top: 1px solid rgba(255, 255, 255, 0.12);
				"
			/>

			<h2 style="margin: 0; font-size: 16px">Arbejdsregler</h2>

			<label style="display: grid; gap: 6px">
				<span style="font-weight: 600">Timer pr. uge</span>
				<input v-model="weeklyHours" inputmode="numeric" />
			</label>

			<label style="display: grid; gap: 6px">
				<span style="font-weight: 600">Middagspause pr. dag (min)</span>
				<input v-model="breakMinutesPerDay" inputmode="numeric" />
			</label>

			<label style="display: flex; gap: 10px; align-items: center">
				<input v-model="breakIsPaid" type="checkbox" />
				<span style="font-weight: 600">Pausen er betalt</span>
			</label>

			<div style="display: flex; gap: 10px; margin-top: 8px">
				<button class="pill" type="submit" :disabled="loading">
					{{ loading ? 'Opretter...' : 'Opret bruger' }}
				</button>

				<button
					class="pill"
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
}

.muted {
	opacity: 0.75;
}
</style>
