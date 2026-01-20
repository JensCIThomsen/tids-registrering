<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
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
const isCompanyAdmin = computed(() => role.value === 'COMPANY_ADMIN');
const isEmployee = computed(() => role.value === 'EMPLOYEE');

const KEY = 'tdtr_session';

const prettyStatus = computed(() => {
	const s = status.value?.status ?? null;
	if (s === 'MOEDT') return 'Mødt';
	if (s === 'PAUSE_START') return 'På pause';
	if (s === 'PAUSE_END') return 'Mødt';
	if (s === 'GAAET') return 'Gået';
	return 'Ingen status';
});

const lastUpdatedAt = ref(null);
const liveSeconds = ref(0);
let liveTimer = null;

let refreshTimer = null;

function startLiveTimer(fromDate) {
	stopLiveTimer();

	if (!fromDate) return;

	const start = new Date(fromDate).getTime();

	liveTimer = setInterval(() => {
		liveSeconds.value = Math.floor((Date.now() - start) / 1000);
	}, 1000);
}

function stopLiveTimer() {
	if (liveTimer) {
		clearInterval(liveTimer);
		liveTimer = null;
	}
	liveSeconds.value = 0;
}

function formatDuration(sec) {
	const h = Math.floor(sec / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const s = sec % 60;

	if (h > 0) {
		return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}
	return `${m}:${String(s).padStart(2, '0')}`;
}

function startAutoRefresh() {
	if (refreshTimer) clearInterval(refreshTimer);

	refreshTimer = setInterval(async () => {
		// undgå spam mens bruger klikker
		if (busy.value) return;

		// hvis token er væk, så redirect (failsafe)
		if (!ensureTokenOrRedirect()) return;

		// hent status (kun hvis vi har user)
		if (!userId.value) return;

		try {
			status.value = await getStatus(userId.value);
			if (
				status.value?.status === 'MOEDT' ||
				status.value?.status === 'PAUSE_START'
			) {
				startLiveTimer(status.value.at);
			} else {
				stopLiveTimer();
			}
			lastUpdatedAt.value = new Date();
		} catch {
			// ignorer transient fejl her – brugeren kan stadig klikke knapper
		}
	}, 10000);
}

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

// function getAccessTokenOrNull() {
// 	try {
// 		const raw = localStorage.getItem(KEY);
// 		if (!raw) return null;
// 		const s = JSON.parse(raw);
// 		return s?.accessToken ?? null;
// 	} catch {
// 		return null;
// 	}
// }

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
		if (
			status.value?.status === 'MOEDT' ||
			status.value?.status === 'PAUSE_START'
		) {
			startLiveTimer(status.value.at);
		} else {
			stopLiveTimer();
		}
		lastUpdatedAt.value = new Date();
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
		startLiveTimer(new Date());
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
		stopLiveTimer();
		status.value = await getStatus(userId.value);
	} catch (e) {
		error.value = e?.response?.data?.message ?? e?.message ?? 'Fejl';
	} finally {
		busy.value = false;
	}
}

// async function postWithToken(path) {
// 	if (!ensureTokenOrRedirect()) return null;

// 	const token = getAccessTokenOrNull();
// 	if (!token) {
// 		logout();
// 		router.push('/login');
// 		return null;
// 	}

// 	const res = await fetch(path, {
// 		method: 'POST',
// 		headers: {
// 			Authorization: `Bearer ${token}`,
// 		},
// 	});

// 	let data = null;
// 	try {
// 		data = await res.json();
// 	} catch {
// 		data = null;
// 	}

// 	if (!res.ok) {
// 		error.value = data?.message ?? `Fejl (${res.status})`;
// 		return null;
// 	}

// 	if (data?.ok === false) {
// 		error.value = data?.error ?? 'Ukendt fejl';
// 		return null;
// 	}

// 	return data;
// }

async function onPauseStart() {
	error.value = '';

	if (!ensureTokenOrRedirect()) return;

	busy.value = true;
	try {
		await pauseStart();
		startLiveTimer(new Date());
		status.value = await getStatus(userId.value);
	} catch (e) {
		error.value = e?.response?.data?.message ?? e?.message ?? 'Fejl';
	} finally {
		busy.value = false;
	}
}

async function onPauseEnd() {
	error.value = '';

	if (!ensureTokenOrRedirect()) return;

	busy.value = true;
	try {
		await pauseEnd();
		startLiveTimer(new Date());
		status.value = await getStatus(userId.value);
	} catch (e) {
		error.value = e?.response?.data?.message ?? e?.message ?? 'Fejl';
	} finally {
		busy.value = false;
	}
}

onBeforeUnmount(() => {
	if (refreshTimer) clearInterval(refreshTimer);
});

onMounted(async () => {
	if (!ensureTokenOrRedirect()) return;
	if (!userId.value) return;
	await hentStatus();
	startAutoRefresh();
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
					<span class="updated" v-if="lastUpdatedAt">
						Opdateret:
						{{
							lastUpdatedAt.toLocaleTimeString('da-DK', {
								hour: '2-digit',
								minute: '2-digit',
								second: '2-digit',
							})
						}}
					</span>
					<span class="timer" v-if="liveSeconds > 0">
						Tid: {{ formatDuration(liveSeconds) }}
					</span>
				</div>
				<p v-if="isCompanyAdmin" class="adminHint">
					Medarbejder-registrering. Se dagens overblik under
					<strong>Dagens status</strong>.
				</p>
			</div>

			<div v-if="isEmployee" class="actions">
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
				<div v-if="status" class="statusLine">
					<div class="statusRow">
						<span class="label">Status</span>
						<span class="value">{{ prettyStatus }}</span>
					</div>

					<div class="statusRow">
						<span class="label">Tidspunkt</span>
						<span class="value">
							{{
								status.at
									? new Date(status.at).toLocaleString(
											'da-DK',
										)
									: '-'
							}}
						</span>
					</div>
				</div>

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

	padding: 8px 14px;
	border-radius: 999px;

	font-weight: 800;
	font-size: 13px;
	letter-spacing: 0.02em;

	border: 1px solid transparent;
}

.badge[data-state='present'] {
	background: #dcfce7;
	border-color: #22c55e;
	color: #065f46;
}

.badge[data-state='paused'] {
	background: #ffedd5;
	border-color: #f59e0b;
	color: #92400e;
}

.badge[data-state='left'] {
	background: #fee2e2;
	border-color: #ef4444;
	color: #7f1d1d;
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
	border: 1px solid #d1d5db;
	background: #f3f4f6;
	color: #111827;

	padding: 12px 12px;
	border-radius: 12px;
	cursor: pointer;
	font-weight: 700;

	transition:
		background 0.15s ease,
		color 0.15s ease,
		opacity 0.15s ease;
}

.btn:hover:enabled {
	background: #f2f2f2;
}

.btn:disabled {
	background: #e5e7eb;
	border-color: #d1d5db;
	color: #9ca3af;

	opacity: 1;
	cursor: not-allowed;
}

.btn.primary {
	background: #111;
	border-color: #111;
	color: #fff;
}

.btn.primary:disabled {
	background: #9ca3af;
	border-color: #9ca3af;
	color: #f9fafb;
}

.btn.primary:hover:enabled {
	background: #000;
}

.btn.danger {
	background: #fee2e2;
	border-color: #fca5a5;
	color: #991b1b;
}

.btn.danger:disabled {
	background: #f3f4f6;
	border-color: #e5e7eb;
	color: #9ca3af;
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
	.header {
		flex-direction: column;
	}

	.statusBox {
		align-items: flex-start;
		width: 100%;
	}

	.actions {
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}

	.btn {
		padding: 14px 12px;
		font-size: 14px;
	}
}

.statusLine {
	background: #f4f6f8;
	border: 1px solid #d0d7de;
	border-radius: 12px;
	padding: 14px;
}

.statusRow {
	display: flex;
	justify-content: space-between;
	gap: 16px;
	padding: 6px 0;
}

.label {
	color: #6b7280;
	font-weight: 700;
}

.value {
	color: #111827;
	font-weight: 800;
}

.updated {
	color: #6b7280;
	font-size: 12px;
	font-weight: 600;
}
.timer {
	color: #111827;
	font-size: 14px;
	font-weight: 800;
}

.adminNote {
	margin: 12px 0 0 0;
	padding: 12px 14px;
	border-radius: 12px;
	background: #f4f6f8;
	border: 1px solid #d0d7de;
	color: #111827;
	font-weight: 600;
}

.adminHint {
	margin-top: 8px;
	color: #6b7280;
	font-size: 13px;
}
</style>
