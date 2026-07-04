import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { normalizeUser, seventhingsApiRequest, validateUuid } from '../../transport';

const USER_PATH = '/customer-api/v1/user';
const USERS_PATH = '/customer-api/v1/users';

type UserHandler = (this: IExecuteFunctions, i: number) => Promise<INodeExecutionData[]>;

function getUserUuid(this: IExecuteFunctions, i: number): string {
	const value = this.getNodeParameter('userId', i, undefined, {
		extractValue: true,
	}) as string;
	try {
		return validateUuid(value, 'User UUID');
	} catch (error) {
		throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
	}
}

async function collectUsers(
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
			path: USERS_PATH,
			qs: { ...qsBase, page, per_page: perPage },
		})) as IDataObject;

		const items = Array.isArray(response.items) ? (response.items as IDataObject[]) : [];
		collected.push(...items.map((item) => normalizeUser(item)));

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

const handlers: Record<string, UserHandler> = {
	async get(this: IExecuteFunctions, i: number) {
		const uuid = getUserUuid.call(this, i);
		const record = (await seventhingsApiRequest.call(this, {
			path: `${USER_PATH}/${uuid}`,
		})) as IDataObject;
		return [{ json: normalizeUser(record, uuid), pairedItem: { item: i } }];
	},

	async getById(this: IExecuteFunctions, i: number) {
		const id = this.getNodeParameter('userNumericId', i) as number;
		const record = (await seventhingsApiRequest.call(this, {
			path: `${USER_PATH}/by-id/${id}`,
		})) as IDataObject;
		return [{ json: normalizeUser(record), pairedItem: { item: i } }];
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
		const records = await collectUsers.call(this, returnAll, limit, qs);
		return records.map((json) => ({ json, pairedItem: { item: i } }));
	},
};

export function isUserOperationSupported(operation: string): boolean {
	return operation in handlers;
}

export async function executeUserOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	const handler = handlers[operation];
	if (!handler) {
		throw new NodeOperationError(
			this.getNode(),
			`The user operation "${operation}" is not implemented yet.`,
			{ itemIndex: i },
		);
	}
	return handler.call(this, i);
}
