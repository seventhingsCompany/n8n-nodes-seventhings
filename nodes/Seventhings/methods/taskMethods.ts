/**
 * Dynamic-option methods for the Task resource.
 *
 *  - `searchTasks` (listSearch): pick a task from a searchable list in the
 *    resourceLocator used by Update / Get / Close / Reopen / Delete.
 *
 * Replaces the Zapier `list_tasks` dynamic dropdown data source.
 */

import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchResult,
} from 'n8n-workflow';

import { normalizeTask, seventhingsApiRequest } from '../transport';

/** Best-effort human label for a task row in the picker. */
function taskLabel(item: IDataObject, uuid: string): string {
	const candidate = item.title;
	const text = typeof candidate === 'string' && candidate.trim() !== '' ? candidate : uuid;
	return text === uuid ? uuid : `${text} (${uuid})`;
}

export const taskListSearch = {
	async searchTasks(
		this: ILoadOptionsFunctions,
		filter?: string,
	): Promise<INodeListSearchResult> {
		// The tasks endpoint returns a bare array (no `{ items }` wrapper) and
		// ignores pagination params, so read the response as a flat list.
		const response = (await seventhingsApiRequest.call(this, {
			path: '/customer-api/v1/task-management/tasks',
			qs: {
				'sort[updated_at]': 'DESC',
			},
		})) as IDataObject[];

		const items = Array.isArray(response) ? response : [];
		const search = (filter ?? '').toLowerCase();

		const results = items
			.map((item) => {
				const normalized = normalizeTask(item);
				const uuid = (normalized.uuid as string | undefined) ?? '';
				return { name: taskLabel(normalized, uuid), value: uuid };
			})
			.filter((entry) => entry.value !== '')
			.filter((entry) => search === '' || entry.name.toLowerCase().includes(search));

		return { results };
	},
};
