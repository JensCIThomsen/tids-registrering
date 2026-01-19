<script setup>
import { computed, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { session, logout } from '../services/auth';
import {
	getStatus,
	moedT,
	gaaet,
	pauseStart,
	pauseEnd,
} from '@/services/attendance';

const router = useRouter();

const status = ref(null);
const error = ref('');
const busy = ref(false);

const userId = computed(() => session.value?.id || '');
const role = computed(() => session.value?.role || null);

const KEY = 'tdtr_session';

function ensureTokenOrRedirect() {
	const raw = localStorage.getItem(KEY);

	if (!raw) {
		logout();
		router.push('/login');
		return false;
	}

	try {
		const s = JSON.parse(raw);
		if (!s?.accessToken) {
			logout();
			router.push('/login');
			return false;
		}
	} catch {
		logout();
		router.push('/login');
		return false;
	}

	return true;
}

function getAccessTokenOrNull() {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const s = JSON.parse(raw);
		return s?.accessToken ?? null;
	} catch {
		return null;
	}
}

function stateKey() {
	const s = status.value?.status ?? null;
	if (s === 'MOEDT') return 'present';
	if (s === 'PAUSE_START') return 'paused';
	if (s === 'PAUSE_END') return 'present';
	if (s === 'GAAET') return 'left';
	return 'unknown';
}

function stateLabel() {
	const s = status.value?.status ?? null;
	if (s === 'MOEDT') return 'Mødt';
	if (s === 'PAUSE_START') return 'På pause';
	if (s === 'PAUSE_END') return 'Mødt';
	if (s === 'GAAET') return 'Gået';
	return 'Ingen status';
}

const canMoedt = computed(() => {
	const s = status.value?.status ?? null;
	return s === null || s === 'GAAET';
});

const canPauseStart = computed(() => {
	const s = status.value?.status ?? null;
	return s === 'MOEDT' || s === 'PAUSE_END';
});

const canPauseEnd = computed(() => {
	const s = status.value?.status ?? null;
	return s === 'PAUSE_START';
});

const canGaaet = computed(() => {
	const s = status.value?.status ?? null;
	return s === 'MOEDT' || s === 'PAUSE_END';
});

async function hentStatus() {
	error.value = '';
	status.value = null;

	if (!ensureTokenOrRedirect()) return;

	if (!userId.value) {
		error.value = 'Mangler bruger-id i session (log ind igen).';
		return;
	}

	try {
		status.value = await getStatus(userId.value);
	} catch (e) {
		error.value = e?.response?.data?.message ?? e?.message ?? 'Fejl';
	}
}

async function onMoedt() {
	error.value = '';

	if (!ensureTokenOrRedirect()) return;

	busy.value = true;
	try {
		await moedT();
		status.value = await getStatus(userId.value);
	} catch (e) {
		error.value = e?.response?.data?.message ?? e?.message ?? 'Fejl';
	} finally {
		busy.value = false;
	}
}

async function onGaaet() {
	error.value = '';

	if (!ensureTokenOrRedirect()) return;

	busy.value = true;
	try {
		await gaaet();
		status.value = await getStatus(userId.value);
	} catch (e) {
		error.value = e?.response?.data?.message ?? e?.message ?? 'Fejl';
	} finally {
		busy.value = false;
	}
}

async function postWithToken(path) {
	if (!ensureTokenOrRedirect()) return null;

	const token = getAccessTokenOrNull();
	if (!token) {
		logout();
		router.push('/login');
		return null;
	}

	const res = await fetch(path, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
		},
	});

	let data = null;
	try {
		data = await res.json();
	} catch {
		data = null;
	}

	if (!res.ok) {
		error.value = data?.message ?? `Fejl (${res.status})`;
		return null;
	}

	if (data?.ok === false) {
		error.value = data?.error ?? 'Ukendt fejl';
		return null;
	}

	return data;
}

async function onPauseStart() {
	error.value = '';

	busy.value = true;
	try {
		await postWithToken('/attendance/pause/start');
		await pauseStart();
		status.value = await getStatus(userId.value);
	} finally {
		busy.value = false;
	}
}

async function onPauseEnd() {
	error.value = '';

	busy.value = true;
	try {
		await postWithToken('/attendance/pause/end');
		await pauseEnd();
		status.value = await getStatus(userId.value);
	} finally {
		busy.value = false;
	}
}

onMounted(async () => {
	if (!ensureTokenOrRedirect()) return;
	if (!userId.value) return;
	await hentStatus();
});
</script>

<template>
	<div class="page">
		<div class="card">
			<div class="header">
				<div>
					<h2>Tidsregistrering</h2>

					<p class="muted" v-if="role === 'COMPANY_ADMIN'">
						Du er logget ind som <strong>COMPANY_ADMIN</strong>. Log
						ind som en <strong>EMPLOYEE</strong> for at bruge
						Mødt/Pause/Gået.
					</p>

					<p class="muted" v-else>
						UserId: <strong>{{ userId || '-' }}</strong>
					</p>
				</div>

				<div class="statusBox">
					<span class="badge" :data-state="stateKey()">
						{{ stateLabel() }}
					</span>

					<span class="time" v-if="status?.at">
						{{ new Date(status.at).toLocaleString('da-DK') }}
					</span>
					<span class="time" v-else>-</span>
				</div>
			</div>

			<div class="actions">
				<button
					class="btn"
					@click="hentStatus"
					:disabled="busy || !userId"
				>
					Hent status
				</button>

				<button
					class="btn primary"
					@click="onMoedt"
					:disabled="busy || !userId || !canMoedt"
				>
					Mødt
				</button>

				<button
					class="btn"
					@click="onPauseStart"
					:disabled="busy || !userId || !canPauseStart"
				>
					Start pause
				</button>

				<button
					class="btn"
					@click="onPauseEnd"
					:disabled="busy || !userId || !canPauseEnd"
				>
					Slut pause
				</button>

				<button
					class="btn danger"
					@click="onGaaet"
					:disabled="busy || !userId || !canGaaet"
				>
					Gået
				</button>
			</div>

			<div class="info">
				<pre v-if="status" class="json">{{
					JSON.stringify(status, null, 2)
				}}</pre>

				<p v-if="error" class="error">{{ error }}</p>
			</div>
		</div>
	</div>
</template>

<style scoped>
.page {
	max-width: 900px;
	margin: 40px auto;
	padding: 0 16px;
}

.card {
	background: #fff;
	border: 1px solid #e9e9e9;
	border-radius: 16px;
	box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
	padding: 18px;
}

.header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 16px;
	border-bottom: 1px solid #f0f0f0;
	padding-bottom: 14px;
	margin-bottom: 14px;
}

h2 {
	margin: 0;
	font-size: 22px;
	font-weight: 800;
	color: #111;
}

.muted {
	margin: 8px 0 0 0;
	color: #666;
}

.statusBox {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 8px;
	min-width: 180px;
}

.badge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding: 8px 12px;
	border-radius: 999px;
	font-weight: 700;
	font-size: 13px;
	border: 1px solid #ddd;
	background: #f7f7f7;
}

.badge[data-state='present'] {
	border-color: #b9e4c9;
	background: #eefbf3;
}

.badge[data-state='paused'] {
	border-color: #ffe4b3;
	background: #fff7ea;
}

.badge[data-state='left'] {
	border-color: #ffb7b7;
	background: #fff0f0;
}

.time {
	color: #374151;
	font-size: 12px;
	font-weight: 600;
}

.actions {
	display: grid;
	grid-template-columns: repeat(5, 1fr);
	gap: 10px;
	margin-top: 10px;
}

.btn {
	border: 1px solid #dedede;
	background: #fafafa;
	padding: 12px 12px;
	border-radius: 12px;
	cursor: pointer;
	font-weight: 700;
}

.btn:hover:enabled {
	background: #f2f2f2;
}

.btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.btn.primary {
	background: #111;
	border-color: #111;
	color: #fff;
}

.btn.primary:hover:enabled {
	background: #000;
}

.btn.danger {
	background: #fff5f5;
	border-color: #ffcccc;
}

.info {
	margin-top: 14px;
}

.json {
	margin: 0;
	font-size: 13px;
	line-height: 1.4;
	white-space: pre-wrap;

	background: #f4f6f8;
	border: 1px solid #d0d7de;
	border-radius: 12px;
	padding: 14px;

	color: #1f2937; /* mørk tekst */
	font-family:
		ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.error {
	margin-top: 12px;
	color: #b10000;
	font-weight: 700;
	white-space: pre-wrap;
}

@media (max-width: 900px) {
	.actions {
		grid-template-columns: 1fr 1fr;
	}
	.statusBox {
		align-items: flex-start;
		min-width: auto;
	}
	.header {
		flex-direction: column;
	}
}
</style>
