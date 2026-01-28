<script setup>
import { computed, onMounted, ref } from 'vue';
import { apiFetch } from '../services/api';
import { session } from '../services/auth';

const loading = ref(true);
const error = ref('');

const weekStart = ref(null);
const weekEnd = ref(null);
const users = ref([]);

const showOnlyWithRegistrations = ref(false);

/* ---------- helpers ---------- */

function formatMinutes(min) {
	const m = Math.trunc(min || 0);
	const sign = m < 0 ? '-' : '';
	const abs = Math.abs(m);
	const h = Math.floor(abs / 60);
	const mm = abs % 60;
	return `${sign}${h} t ${String(mm).padStart(2, '0')} min`;
}

function formatDate(d) {
	if (!d) return '';
	return new Date(d).toLocaleDateString('da-DK');
}

function saldoClass(minutes) {
	if (minutes > 0) return 'saldo-plus';
	if (minutes < 0) return 'saldo-minus';
	return 'saldo-zero';
}

function dayWarnings(d) {
	const warnings = [];

	const events = Number(d?.eventsCount ?? 0);
	const intervals = Array.isArray(d?.intervals) ? d.intervals.length : 0;

	if (events % 2 === 1) {
		warnings.push('Mangler "gået"');
	} else if (events > 0 && intervals * 2 !== events) {
		warnings.push('Ujævn registrering');
	}

	return warnings;
}

/* ---------- modal ---------- */

const showDetails = ref(false);
const detailsLoading = ref(false);
const detailsError = ref('');
const details = ref(null);

function formatDay(yyyyMmDd) {
	const [y, m, d] = yyyyMmDd.split('-').map(Number);
	const dt = new Date(Date.UTC(y, m - 1, d));
	return dt.toLocaleDateString('da-DK', {
		weekday: 'short',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	});
}

function formatTimeUtc(d) {
	return new Date(d).toLocaleTimeString('da-DK', {
		timeZone: 'UTC',
		hour: '2-digit',
		minute: '2-digit',
	});
}

async function openDetails(u) {
	showDetails.value = true;
	details.value = null;
	detailsError.value = '';
	detailsLoading.value = true;

	expandedDay.value = null;
	dayEvents.value = [];
	dayEventsError.value = '';
	dayEventsLoading.value = false;

	try {
		const token = session.value?.accessToken;
		const res = await apiFetch(`/attendance/week/user/${u.userId}`, {
			headers: { Authorization: `Bearer ${token}` },
		});

		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			detailsError.value = data?.message || 'Kunne ikke hente detaljer';
			return;
		}

		details.value = data;
	} catch {
		detailsError.value = 'Netværksfejl';
	} finally {
		detailsLoading.value = false;
	}
}

function closeDetails() {
	showDetails.value = false;
	details.value = null;

	expandedDay.value = null;
	dayEvents.value = [];
	dayEventsError.value = '';
	dayEventsLoading.value = false;
}

/* ---------- dag-events (edit panel) ---------- */

const expandedDay = ref(null); // 'YYYY-MM-DD'
const dayEventsLoading = ref(false);
const dayEventsError = ref('');
const dayEvents = ref([]);

function formatTimeLocal(d) {
	return new Date(d).toLocaleTimeString('da-DK', {
		timeZone: 'Europe/Copenhagen',
		hour: '2-digit',
		minute: '2-digit',
	});
}

async function toggleDayEvents(date) {
	if (!details.value?.user?.id) return;

	if (expandedDay.value === date) {
		expandedDay.value = null;
		dayEvents.value = [];
		dayEventsError.value = '';
		dayEventsLoading.value = false;
		return;
	}

	expandedDay.value = date;
	dayEvents.value = [];
	dayEventsError.value = '';
	dayEventsLoading.value = true;

	try {
		const token = session.value?.accessToken;
		const userId = details.value.user.id;

		const res = await apiFetch(`/attendance/user/${userId}/day/${date}`, {
			headers: { Authorization: `Bearer ${token}` },
		});

		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			dayEventsError.value =
				data?.message || 'Kunne ikke hente dagens events';
			return;
		}

		dayEvents.value = Array.isArray(data?.events) ? data.events : [];
	} catch {
		dayEventsError.value = 'Netværksfejl';
	} finally {
		dayEventsLoading.value = false;
	}
}

/* ---------- uge ---------- */

const rows = computed(() => {
	const base = users.value.map((u) => ({
		...u,
		expectedLabel: formatMinutes(u.expectedMinutes),
		grossLabel: formatMinutes(u.workedMinutesGross),
		breakLabel: formatMinutes(u.breakMinutesDeducted),
		netLabel: formatMinutes(u.workedMinutesNet),
		deltaLabel: formatMinutes(u.deltaMinutes),
	}));

	if (!showOnlyWithRegistrations.value) return base;
	return base.filter((u) => Number(u.workedMinutesGross || 0) > 0);
});

async function load() {
	loading.value = true;
	error.value = '';

	try {
		const token = session.value?.accessToken;
		const res = await apiFetch('/attendance/week', {
			headers: { Authorization: `Bearer ${token}` },
		});

		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			error.value = data?.message || 'Kunne ikke hente uge';
			return;
		}

		weekStart.value = data.weekStart;
		weekEnd.value = data.weekEnd;
		users.value = data.users || [];
	} catch {
		error.value = 'Netværksfejl';
	} finally {
		loading.value = false;
	}
}

onMounted(load);
</script>

<template>
	<div class="card">
		<h1>Ugeoverblik</h1>

		<p v-if="weekStart && weekEnd" class="muted">
			{{ formatDate(weekStart) }} – {{ formatDate(weekEnd) }}
		</p>

		<label style="display: inline-flex; gap: 10px; margin: 10px 0">
			<input v-model="showOnlyWithRegistrations" type="checkbox" />
			<span class="muted">Vis kun employees med registreringer</span>
		</label>

		<table class="table" style="width: 100%">
			<thead>
				<tr>
					<th>Employee</th>
					<th>Norm</th>
					<th>Brutto</th>
					<th>Pause</th>
					<th>Netto</th>
					<th>Saldo</th>
					<th></th>
				</tr>
			</thead>

			<tbody>
				<tr v-for="u in rows" :key="u.userId">
					<td>
						<div
							style="display: flex; align-items: center; gap: 6px"
						>
							<strong>{{ u.name || u.email }}</strong>

							<span
								v-if="u.hasWarnings"
								style="color: #ffb4b4; font-weight: 900"
							>
								⚠️
							</span>
						</div>

						<div class="muted">{{ u.email }}</div>
					</td>

					<td>{{ u.expectedLabel }}</td>
					<td>{{ u.grossLabel }}</td>
					<td>{{ u.breakLabel }}</td>
					<td>{{ u.netLabel }}</td>

					<td>
						<span
							:class="saldoClass(u.deltaMinutes)"
							style="font-weight: 700"
						>
							{{ u.deltaLabel }}
						</span>
					</td>

					<td>
						<button class="pill" @click="openDetails(u)">
							Detaljer
						</button>
					</td>
				</tr>
			</tbody>
		</table>

		<!-- modal -->
		<div v-if="showDetails" class="modal-backdrop">
			<div class="card modal">
				<button class="pill" style="float: right" @click="closeDetails">
					Luk
				</button>

				<h2>{{ details?.user?.name || details?.user?.email }}</h2>

				<div
					v-if="detailsLoading"
					class="muted"
					style="margin-top: 10px"
				>
					Henter...
				</div>
				<div
					v-else-if="detailsError"
					class="error"
					style="margin-top: 10px"
				>
					{{ detailsError }}
				</div>

				<table
					v-else
					class="table"
					style="width: 100%; margin-top: 12px"
				>
					<thead>
						<tr>
							<th>Dag</th>
							<th>Brutto</th>
							<th>Pause</th>
							<th>Netto</th>
							<th>Intervaller</th>
							<th
								style="
									width: 1%;
									white-space: nowrap;
									text-align: right;
								"
							>
								Ret
							</th>
						</tr>
					</thead>

					<tbody>
						<template
							v-for="d in details?.days || []"
							:key="d.date"
						>
							<tr>
								<td>
									<div
										style="
											display: flex;
											align-items: center;
											gap: 10px;
											flex-wrap: wrap;
										"
									>
										<span>{{ formatDay(d.date) }}</span>

										<span
											v-for="(w, idx) in dayWarnings(d)"
											:key="idx"
											style="
												color: #ffb4b4;
												font-weight: 700;
												font-size: 12px;
											"
										>
											⚠️ {{ w }}
										</span>
									</div>
								</td>

								<td>
									{{ formatMinutes(d.workedMinutesGross) }}
								</td>
								<td>
									{{ formatMinutes(d.breakMinutesDeducted) }}
								</td>
								<td>{{ formatMinutes(d.workedMinutesNet) }}</td>

								<td>
									<ul>
										<li
											v-for="(i, idx) in d.intervals"
											:key="idx"
										>
											{{ formatTimeUtc(i.start) }} –
											{{ formatTimeUtc(i.end) }}
										</li>
									</ul>
								</td>

								<td
									style="
										text-align: right;
										white-space: nowrap;
									"
								>
									<button
										class="pill"
										style="padding: 4px 10px"
										@click="toggleDayEvents(d.date)"
									>
										{{
											expandedDay === d.date
												? 'Skjul'
												: 'Rediger'
										}}
									</button>
								</td>
							</tr>

							<tr v-if="expandedDay === d.date">
								<td colspan="6" style="padding-top: 0">
									<div class="card" style="margin-top: 10px">
										<div
											v-if="dayEventsLoading"
											class="muted"
										>
											Henter events...
										</div>
										<div
											v-else-if="dayEventsError"
											class="error"
										>
											{{ dayEventsError }}
										</div>

										<div v-else>
											<div
												style="
													font-weight: 700;
													margin-bottom: 8px;
												"
											>
												Events for
												{{ formatDay(d.date) }}
											</div>

											<table
												class="table"
												style="width: 100%"
											>
												<thead>
													<tr>
														<th
															style="
																text-align: left;
															"
														>
															Tid
														</th>
														<th
															style="
																text-align: left;
															"
														>
															Type
														</th>
														<th
															style="
																text-align: left;
															"
														>
															Event ID
														</th>
													</tr>
												</thead>
												<tbody>
													<tr
														v-for="e in dayEvents"
														:key="e.id"
													>
														<td>
															{{
																formatTimeLocal(
																	e.at,
																)
															}}
														</td>
														<td>{{ e.type }}</td>
														<td
															class="muted"
															style="
																font-size: 12px;
															"
														>
															{{ e.id }}
														</td>
													</tr>
													<tr
														v-if="
															dayEvents.length ===
															0
														"
													>
														<td
															colspan="3"
															class="muted"
														>
															Ingen events fundet
														</td>
													</tr>
												</tbody>
											</table>

											<div
												class="muted"
												style="
													font-size: 12px;
													margin-top: 8px;
												"
											>
												Næste skridt: “ret tid/type”,
												“slet” og “tilføj event”.
											</div>
										</div>
									</div>
								</td>
							</tr>
						</template>
					</tbody>
				</table>
			</div>
		</div>
	</div>
</template>

<style scoped>
.saldo-plus {
	color: #2ecc71;
}
.saldo-minus {
	color: #e74c3c;
}
.saldo-zero {
	color: #ccc;
}

.modal-backdrop {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.85);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 9999;
}

.modal {
	max-width: 1100px;
	width: 100%;
}

.error {
	color: #ffb4b4;
}
</style>
