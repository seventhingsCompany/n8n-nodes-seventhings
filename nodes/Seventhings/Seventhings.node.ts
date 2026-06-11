import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { assetFields, assetOperations } from './descriptions/AssetDescription';
import { taskFields } from './descriptions/TaskDescription';
import { rentalCaseFields } from './descriptions/RentalCaseDescription';
import { locationFields } from './descriptions/LocationDescription';
import { roomFields } from './descriptions/RoomDescription';
import { fileFields } from './descriptions/FileDescription';
import { executeAssetOperation, isAssetOperationSupported } from './actions/asset';
import { executeTaskOperation, isTaskOperationSupported } from './actions/task';
import { executeRentalCaseOperation, isRentalCaseOperationSupported } from './actions/rentalCase';
import { executeLocationOperation, isLocationOperationSupported } from './actions/location';
import { executeRoomOperation, isRoomOperationSupported } from './actions/room';
import { executeFileOperation, isFileOperationSupported } from './actions/file';
import { listSearch, loadOptions, resourceMapping } from './methods';

/**
 * seventhings action node.
 *
 * Programmatic-style (has an `execute` method) because the integration needs:
 *   - a per-request base URL derived from the credential's subdomain,
 *   - multi-step operations (create-then-fetch via the `Location` header),
 *   - dynamic asset fields from the field-definitions endpoint,
 *   - multipart file upload and find-or-create branching,
 *   - timestamp normalization and typed error mapping.
 * None of which can be expressed with declarative routing.
 *
 * Phase 0 stands up the resource/operation shell only. Operation logic and
 * input fields are added in Phases 2–6.
 */

const resourceProperty: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [
		{ name: 'Asset', value: 'asset' },
		{ name: 'File', value: 'file' },
		{ name: 'Location', value: 'location' },
		{ name: 'Rental Case', value: 'rentalCase' },
		{ name: 'Room', value: 'room' },
		{ name: 'Task', value: 'task' },
	],
	default: 'asset',
};

const taskOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['task'] } },
	options: [
		{ name: 'Close', value: 'close', description: 'Close a task', action: 'Close a task' },
		{ name: 'Create', value: 'create', description: 'Create a task', action: 'Create a task' },
		{ name: 'Delete', value: 'delete', description: 'Delete a task', action: 'Delete a task' },
		{ name: 'Get', value: 'get', description: 'Get a task by UUID', action: 'Get a task' },
		{ name: 'Get Many', value: 'getAll', description: 'Get many tasks', action: 'Get many tasks' },
		{ name: 'Reopen', value: 'reopen', description: 'Reopen a task', action: 'Reopen a task' },
		{ name: 'Update', value: 'update', description: 'Update a task', action: 'Update a task' },
	],
	default: 'create',
};

const rentalCaseOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['rentalCase'] } },
	options: [
		{
			name: 'Create',
			value: 'create',
			description: 'Create a rental case',
			action: 'Create a rental case',
		},
		{
			name: 'Delete',
			value: 'delete',
			description: 'Delete a rental case',
			action: 'Delete a rental case',
		},
		{
			name: 'Get',
			value: 'get',
			description: 'Get a rental case by UUID',
			action: 'Get a rental case',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			description: 'Get many rental cases',
			action: 'Get many rental cases',
		},
		{
			name: 'Update',
			value: 'update',
			description: 'Update a rental case',
			action: 'Update a rental case',
		},
	],
	default: 'create',
};

const locationOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['location'] } },
	options: [
		{
			name: 'Create',
			value: 'create',
			description: 'Create a location',
			action: 'Create a location',
		},
		{
			name: 'Delete',
			value: 'delete',
			description: 'Delete a location',
			action: 'Delete a location',
		},
		{ name: 'Get', value: 'get', description: 'Get a location by UUID', action: 'Get a location' },
		{
			name: 'Get Many',
			value: 'getAll',
			description: 'Get many locations',
			action: 'Get many locations',
		},
		{
			name: 'Update',
			value: 'update',
			description: 'Update a location',
			action: 'Update a location',
		},
	],
	default: 'create',
};

const roomOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['room'] } },
	options: [
		{ name: 'Create', value: 'create', description: 'Create a room', action: 'Create a room' },
		{ name: 'Delete', value: 'delete', description: 'Delete a room', action: 'Delete a room' },
		{ name: 'Get', value: 'get', description: 'Get a room by UUID', action: 'Get a room' },
		{ name: 'Get Many', value: 'getAll', description: 'Get many rooms', action: 'Get many rooms' },
		{ name: 'Update', value: 'update', description: 'Update a room', action: 'Update a room' },
	],
	default: 'create',
};

const fileOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['file'] } },
	options: [
		{ name: 'Upload', value: 'upload', description: 'Upload a file', action: 'Upload a file' },
	],
	default: 'upload',
};

export class Seventhings implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'seventhings',
		name: 'seventhings',
		icon: { light: 'file:seventhings.svg', dark: 'file:seventhings.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Manage assets, tasks, rental cases, locations, rooms and files in seventhings',
		defaults: {
			name: 'seventhings',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'seventhingsApi',
				required: true,
			},
		],
		properties: [
			resourceProperty,
			assetOperations,
			taskOperations,
			rentalCaseOperations,
			locationOperations,
			roomOperations,
			fileOperations,
			...assetFields,
			...taskFields,
			...rentalCaseFields,
			...locationFields,
			...roomFields,
			...fileFields,
		],
	};

	methods = {
		loadOptions,
		listSearch,
		resourceMapping,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const resource = this.getNodeParameter('resource', i) as string;
			const operation = this.getNodeParameter('operation', i) as string;

			try {
				if (resource === 'asset' && isAssetOperationSupported(operation)) {
					const results = await executeAssetOperation.call(this, operation, i);
					returnData.push(...results);
					continue;
				}

				if (resource === 'task' && isTaskOperationSupported(operation)) {
					const results = await executeTaskOperation.call(this, operation, i);
					returnData.push(...results);
					continue;
				}

				if (resource === 'rentalCase' && isRentalCaseOperationSupported(operation)) {
					const results = await executeRentalCaseOperation.call(this, operation, i);
					returnData.push(...results);
					continue;
				}

				if (resource === 'location' && isLocationOperationSupported(operation)) {
					const results = await executeLocationOperation.call(this, operation, i);
					returnData.push(...results);
					continue;
				}

				if (resource === 'room' && isRoomOperationSupported(operation)) {
					const results = await executeRoomOperation.call(this, operation, i);
					returnData.push(...results);
					continue;
				}

				if (resource === 'file' && isFileOperationSupported(operation)) {
					const results = await executeFileOperation.call(this, operation, i);
					returnData.push(...results);
					continue;
				}

				throw new NodeOperationError(
					this.getNode(),
					`The operation "${operation}" for resource "${resource}" is not implemented yet.`,
					{ itemIndex: i },
				);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				// Handlers already throw NodeOperationError / NodeApiError; only wrap
				// anything that slipped through as a raw error.
				if (error instanceof NodeOperationError) {
					throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
				}
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
