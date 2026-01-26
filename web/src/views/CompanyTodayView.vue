<script setup>
import { computed, onMounted, ref } from 'vue';
import { apiFetch } from '../services/api';
import { session } from '../services/auth';

const loading = ref(true);
const error = ref('');

const users = ref([]);

const sortedUsers = computed(() => {
	const rank = (t) => {
		if (t === 'MOEDT') return 0;
		if (!t) return 1;
		if (t === 'GAAET') return 2;
		return 3;
	};

	return [...users.value].sort((a, b) => {
		const r = rank(a.type) - rank(b.type);
		if (r !== 0) return r;
		return String(a.email || '').localeCompare(String(b.email || ''));
	});
});

const companyName = ref('');

/* ---------- modal: dagens events for én bruger ---------- */

const showEvents = ref(false);
const eventsLoading = ref(false);
const eventsError = ref('');
const eventsUser = ref(null);
const events = ref([]);

async function openEvents(u) {
	eventsUser.value = u;
	showEvents.value = true;
	events.value = [];
	eventsError.value = '';
	eventsLoading.value = true;

	try {
		const token = session.value?.accessToken;
		if (!token) {
			eventsError.value = 'Du er ikke logget ind';
			return;
		}

		const res = await apiFetch(`/attendance/today/user/${u.userId}`, {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		const data = await res.json().catch(() => null);

		if (!res.ok) {
			eventsError.value =
				data?.message || 'Kunne ikke hente dagens registreringer';
			return;
		}

		events.value = data?.events || [];
	} catch {
		eventsError.value = 'Kunne ikke forbinde til serveren';
	} finally {
		eventsLoading.value = false;
	}
}

function closeEvents() {
	showEvents.value = false;
	eventsUser.value = null;
	events.value = [];
	eventsError.value = '';
	eventsLoading.value = false;
}

/* ---------- load dashboard ---------- */

async function load() {
	loading.value = true;
	error.value = '';

	try {
		const token = session.value?.accessToken;
		if (!token) {
			error.value = 'Du er ikke logget ind';
			return;
		}

		const [resToday, resCompany] = await Promise.all([
			apiFetch('/attendance/today', {
				headers: { Authorization: `Bearer ${token}` },
			}),
			apiFetch('/attendance/company', {
				headers: { Authorization: `Bearer ${token}` },
			}),
		]);

		if (!resToday.ok) {
			const t = await resToday.text().catch(() => '');
			throw new Error(t || 'Kunne ikke hente today');
		}

		const data = await resToday.json();
		users.value = data.users || [];

		if (resCompany.ok) {
			const c = await resCompany.json();
			companyName.value = c?.company?.name || '';
		} else {
			companyName.value = '';
		}
	} catch {
		error.value = 'Kunne ikke forbinde til serveren';
	} finally {
		loading.value = false;
	}
}

function typeLabel(type) {
	if (type === 'MOEDT') return 'Mødt';
	if (type === 'GAAET') return 'Gået';
	return 'Ingen';
}

function typeIcon(type) {
	if (type === 'MOEDT') return '🟢';
	if (type === 'GAAET') return '✅';
	return '⚪';
}

/* ---------- arbejdstid + intervaller (i modal) ---------- */

function formatDurationMs(ms) {
	if (ms <= 0) return '0 min';
	const totalMinutes = Math.floor(ms / 60000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;

	if (hours <= 0) return `${minutes} min`;
	if (minutes === 0) return `${hours} t`;
	return `${hours} t ${minutes} min`;
}

const workSummary = computed(() => {
	let openStart = null;
	let totalMs = 0;

	const intervals = [];

	for (const e of events.value) {
		if (e.type === 'MOEDT') {
			openStart = new Date(e.at).getTime();
		} else if (e.type === 'GAAET') {
			if (openStart) {
				const end = new Date(e.at).getTime();
				if (end > openStart) {
					totalMs += end - openStart;
					intervals.push({
						start: openStart,
						end,
					});
				}
				openStart = null;
			}
		}
	}

	return {
		totalMs,
		text: formatDurationMs(totalMs),
		hasOpen: openStart !== null,
		intervals,
	};
});

const counts = computed(() => {
	const total = users.value.length;
	let met = 0;
	let gaaet = 0;
	let ingen = 0;

	for (const u of users.value) {
		if (u.type === 'MOEDT') met++;
		else if (u.type === 'GAAET') gaaet++;
		else ingen++;
	}

	return {
		total,
		met,
		gaaet,
		ingen,
		manglerAtGaa: met,
	};
});

onMounted(load);
</script>

<template>
	<div class="card">
		<h1 style="margin: 0 0 6px 0">Dagens overblik</h1>
		<p v-if="companyName" class="muted" style="margin: 0 0 16px 0">
			{{ companyName }}
		</p>

		<div v-if="loading" class="muted">Henter...</div>
		<div v-else-if="error" class="error">{{ error }}</div>

		<div v-else>
			<div class="card" style="margin-bottom: 14px">
				<div style="display: flex; gap: 14px; flex-wrap: wrap">
					<div><strong>Brugere:</strong> {{ counts.total }}</div>
					<div><strong>Mødt:</strong> {{ counts.met }}</div>
					<div><strong>Gået:</strong> {{ counts.gaaet }}</div>
					<div>
						<strong>Ingen registrering:</strong> {{ counts.ingen }}
					</div>
					<div>
						<strong>Mangler at gå:</strong>
						{{ counts.manglerAtGaa }}
					</div>
				</div>

				<div style="margin-top: 10px">
					<button class="pill" style="cursor: pointer" @click="load">
						Opdater
					</button>
				</div>
			</div>

			<table class="table" style="width: 100%">
				<thead>
					<tr>
						<th style="text-align: left">Email</th>
						<th style="text-align: left">Status</th>
						<th style="text-align: left">Detaljer</th>
						<th style="text-align: left">Tid</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="u in sortedUsers" :key="u.userId">
						<td>{{ u.email }}</td>
						<td>
							<span
								style="
									display: inline-flex;
									gap: 8px;
									align-items: center;
								"
							>
								<span>{{ typeIcon(u.type) }}</span>
								<span>{{ typeLabel(u.type) }}</span>
							</span>
						</td>

						<td>
							<button
								v-if="(u.eventsToday || 0) > 0"
								class="pill"
								style="cursor: pointer"
								@click="openEvents(u)"
							>
								Vis alle ({{ u.eventsToday }})
							</button>

							<span v-else class="muted">-</span>
						</td>

						<td>
							{{
								u.at
									? new Date(u.at).toLocaleString('da-DK', {
											timeZone: 'UTC',
										})
									: '-'
							}}
						</td>
					</tr>
				</tbody>
			</table>

			<!-- Modal -->
			<div
				v-if="showEvents"
				style="
					position: fixed;
					inset: 0;
					background: rgba(0, 0, 0, 0.85);
					display: flex;
					align-items: center;
					justify-content: center;
					padding: 16px;
					z-index: 9999;
				"
			>
				<div class="card" style="width: 100%; max-width: 720px">
					<div
						style="
							display: flex;
							justify-content: space-between;
							gap: 12px;
							align-items: start;
						"
					>
						<div>
							<strong>Registreringer i dag</strong>
							<div class="muted" style="margin-top: 4px">
								{{
									eventsUser?.name || eventsUser?.email || ''
								}}
							</div>

							<div style="margin-top: 8px">
								<strong>Arbejdstid:</strong>
								{{ workSummary.text }}
								<span v-if="workSummary.hasOpen" class="muted">
									(ikke afsluttet)
								</span>
							</div>
						</div>

						<button
							class="pill"
							style="cursor: pointer"
							@click="closeEvents"
						>
							Luk
						</button>
					</div>

					<div style="margin-top: 12px">
						<div v-if="eventsLoading" class="muted">Henter...</div>
						<div v-else-if="eventsError" class="error">
							{{ eventsError }}
						</div>

						<div v-else>
							<div
								v-if="workSummary.intervals.length"
								style="margin-top: 10px"
							>
								<strong>Arbejdsintervaller:</strong>
								<ul style="margin: 6px 0 0 16px">
									<li
										v-for="(
											i, idx
										) in workSummary.intervals"
										:key="idx"
									>
										{{
											new Date(
												i.start,
											).toLocaleTimeString('da-DK', {
												timeZone: 'UTC',
											})
										}}
										–
										{{
											new Date(i.end).toLocaleTimeString(
												'da-DK',
												{ timeZone: 'UTC' },
											)
										}}
									</li>
								</ul>
							</div>

							<table
								class="table"
								style="width: 100%; margin-top: 12px"
							>
								<thead>
									<tr>
										<th style="text-align: left">Type</th>
										<th style="text-align: left">Tid</th>
									</tr>
								</thead>
								<tbody>
									<tr v-for="e in events" :key="e.id">
										<td>
											{{ typeIcon(e.type) }}
											{{ typeLabel(e.type) }}
										</td>
										<td>
											{{
												new Date(e.at).toLocaleString(
													'da-DK',
													{ timeZone: 'UTC' },
												)
											}}
										</td>
									</tr>

									<tr v-if="events.length === 0">
										<td colspan="2" class="muted">
											Ingen registreringer i dag
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>
				</div>
			</div>
			<!-- /Modal -->
		</div>
	</div>
</template>
