<script setup>
import { onMounted, ref } from 'vue';
import { today } from '@/services/attendance';

const loading = ref(true);
const error = ref('');
const data = ref(null);

async function load() {
	loading.value = true;
	error.value = '';
	data.value = null;

	try {
		const res = await today(); // JWT + companyId fra token
		data.value = res.data;
	} catch (e) {
		error.value = e.response?.data?.message ?? e.message ?? 'Fejl';
	} finally {
		loading.value = false;
	}
}

function typeLabel(type) {
	if (type === 'MOEDT') return 'Mødt';
	if (type === 'GAAET') return 'Gået';
	return type || '';
}

onMounted(load);
</script>

<template>
	<div class="card">
		<h1 style="margin: 0 0 10px 0">Dagens overblik</h1>
		<p class="muted" style="margin: 0 0 18px 0">
			Viser seneste status pr. medarbejder i dag.
		</p>

		<div v-if="loading" class="muted">Henter...</div>
		<div v-else-if="error" class="error">{{ error }}</div>

		<div v-else>
			<div class="card" style="margin-bottom: 14px">
				<div><strong>CompanyId:</strong> {{ data.companyId }}</div>
				<div style="margin-top: 6px">
					<strong>I dag:</strong>
					{{ data.counts.totalUsersWithEventsToday }} med events —
					{{ data.counts.met }} mødt, {{ data.counts.gaaet }} gået
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
						<th style="text-align: left">UserId</th>
						<th style="text-align: left">Email</th>
						<th style="text-align: left">Status</th>
						<th style="text-align: left">Tid</th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="u in data.users" :key="u.userId">
						<td
							style="
								font-family:
									ui-monospace, SFMono-Regular, Menlo, Monaco,
									Consolas, 'Liberation Mono', 'Courier New',
									monospace;
								font-size: 12px;
							"
						>
							{{ u.userId }}
						</td>
						<td>{{ u.email }}</td>
						<td>{{ typeLabel(u.type) }}</td>
						<td>
							{{
								u.at
									? new Date(u.at).toLocaleString('da-DK')
									: '-'
							}}
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</template>
