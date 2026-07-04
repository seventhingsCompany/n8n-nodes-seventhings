import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	buildFilterObject,
	normalizePerson,
	readFilterRows,
	seventhingsApiRequest,
	validateUuid,
} from '../../transport';

const PERSON_PATH = '/customer-api/v1/person';
const PERSONS_PATH = '/customer-api/v1/persons';

type PersonHandler = (this: IExecuteFunctions, i: number) => Promise<INodeExecutionData[]>;

function getPersonUuid(this: IExecuteFunctions, i: number): string {
	const value = this.getNodeParameter('personId', i, undefined, {
		extractValue: true,
	}) as string;
	try {
		return validateUuid(value, 'Person UUID');
	} catch (error) {
		throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
	}
}

function getMappedFields(this: IExecuteFunctions, i: number): IDataObject {
	const fields = this.getNodeParameter('fields', i, {}) as IDataObject;
	return (fields.value as IDataObject | null) ?? {};
}

async function fetchPerson(this: IExecuteFunctions, uuid: string): Promise<IDataObject> {
	const record = (await seventhingsApiRequest.call(this, {
		path: `${PERSON_PATH}/${uuid}`,
	})) as IDataObject;
	return normalizePerson(record, uuid);
}

async function collectPersons(
	this: IExecuteFunctions,
	returnAll: boolean,
	limit: number,
	qsBase: IDataObject,
): Promise<IDataObject[]> {
	const collected: IDataObject[] = [];
	let page = 1;
	const perPage = returnAll ? 100 : Math.min(limit, 100);

	for (;;) {
		const response = (await seventhingsApiRequest.call(this, {
			path: PERSONS_PATH,
			qs: { ...qsBase, page, per_page: perPage },
		})) as IDataObject;

		const items = Array.isArray(response.items) ? (response.items as IDataObject[]) : [];
		collected.push(...items.map((item) => normalizePerson(item)));

		const total = typeof response.total === 'number' ? response.total : undefined;
		if (
			(!returnAll && collected.length >= limit) ||
			items.length < perPage ||
			(total !== undefined && collected.length >= total)
		) {
			break;
		}
		page += 1;
	}

	return returnAll ? collected : collected.slice(0, limit);
}

const handlers: Record<string, PersonHandler> = {
	async create(this: IExecuteFunctions, i: number) {
		const fields = getMappedFields.call(this, i);
		if (Object.keys(fields).length === 0) {
			throw new NodeOperationError(this.getNode(), 'Create person: provide at least one field.', {
				itemIndex: i,
			});
		}

		const response = (await seventhingsApiRequest.call(this, {
			method: 'POST',
			path: PERSON_PATH,
			body: { fields },
			headers: { 'Content-Type': 'application/json' },
			returnFullResponse: true,
		})) as { body?: IDataObject; headers?: IDataObject };

		const location = response.headers?.location ?? response.headers?.Location;
		const uuid = String(location ?? '').split('/').filter(Boolean).pop() ?? '';
		const created = uuid ? await fetchPerson.call(this, uuid) : normalizePerson(response.body ?? {});
		return [{ json: created, pairedItem: { item: i } }];
	},

	async update(this: IExecuteFunctions, i: number) {
		const uuid = getPersonUuid.call(this, i);
		const fields = getMappedFields.call(this, i);
		if (Object.keys(fields).length === 0) {
			throw new NodeOperationError(this.getNode(), 'Update person: provide at least one field.', {
				itemIndex: i,
			});
		}

		await seventhingsApiRequest.call(this, {
			method: 'PATCH',
			path: `${PERSON_PATH}/${uuid}`,
			body: fields,
			headers: { 'Content-Type': 'application/json' },
		});

		const updated = await fetchPerson.call(this, uuid);
		return [{ json: updated, pairedItem: { item: i } }];
	},

	async get(this: IExecuteFunctions, i: number) {
		const uuid = getPersonUuid.call(this, i);
		const record = await fetchPerson.call(this, uuid);
		return [{ json: record, pairedItem: { item: i } }];
	},

	async getById(this: IExecuteFunctions, i: number) {
		const id = this.getNodeParameter('personNumericId', i) as number;
		const record = (await seventhingsApiRequest.call(this, {
			path: `${PERSON_PATH}/by-id/${id}`,
		})) as IDataObject;
		return [{ json: normalizePerson(record), pairedItem: { item: i } }];
	},

	async getAll(this: IExecuteFunctions, i: number) {
		const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
		const limit = returnAll ? Number.POSITIVE_INFINITY : (this.getNodeParameter('limit', i, 50) as number);
		const options = this.getNodeParameter('options', i, {}) as IDataObject;
		const qs: IDataObject = {};
		if (options.sortBy) {
			qs.sort_by = options.sortBy;
		}
		if (options.order) {
			qs.order = options.order;
		}
		const records = await collectPersons.call(this, returnAll, limit, qs);
		return records.map((json) => ({ json, pairedItem: { item: i } }));
	},

	async delete(this: IExecuteFunctions, i: number) {
		const uuid = getPersonUuid.call(this, i);
		await seventhingsApiRequest.call(this, {
			method: 'DELETE',
			path: `${PERSON_PATH}/${uuid}`,
		});
		return [{ json: { uuid, deleted: true }, pairedItem: { item: i } }];
	},

	async createUser(this: IExecuteFunctions, i: number) {
		const filters = readFilterRows(this.getNodeParameter('filterRows', i, {}));
		const filterObject = buildFilterObject(filters);
		const filter = filterObject.filter as IDataObject | undefined;
		if (!filter || Object.keys(filter).length === 0) {
			throw new NodeOperationError(this.getNode(), 'Create user: provide at least one filter.', {
				itemIndex: i,
			});
		}

		await seventhingsApiRequest.call(this, {
			method: 'POST',
			path: `${PERSONS_PATH}/create-user`,
			body: { filter },
			headers: { 'Content-Type': 'application/json' },
		});
		return [{ json: { created: true, filter }, pairedItem: { item: i } }];
	},
};

export function isPersonOperationSupported(operation: string): boolean {
	return operation in handlers;
}

export async function executePersonOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	const handler = handlers[operation];
	if (!handler) {
		throw new NodeOperationError(
			this.getNode(),
			`The person operation "${operation}" is not implemented yet.`,
			{ itemIndex: i },
		);
	}
	return handler.call(this, i);
}
