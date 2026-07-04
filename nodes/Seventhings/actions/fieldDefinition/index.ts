import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	buildFieldDefinitionBody,
	fieldDefinitionPath,
	fetchFieldDefinitions,
	locationHeader,
	parseJsonArray,
	parseJsonParameter,
	seventhingsApiRequest,
	uuidFromLocation,
	type AssetTrackingTemplate,
} from '../../transport';

type FieldDefinitionHandler = (
	this: IExecuteFunctions,
	i: number,
) => Promise<INodeExecutionData[]>;

function getTemplate(this: IExecuteFunctions, i: number): AssetTrackingTemplate {
	return this.getNodeParameter('template', i, 'asset') as AssetTrackingTemplate;
}

function getFieldDefinitionUuid(this: IExecuteFunctions, i: number): string {
	const value = this.getNodeParameter('fieldDefinitionId', i, undefined, {
		extractValue: true,
	}) as string;
	const uuid = String(value ?? '').trim();
	if (!uuid) {
		throw new NodeOperationError(this.getNode(), 'A field definition UUID is required.', {
			itemIndex: i,
		});
	}
	return uuid;
}

function parseArrayInput(this: IExecuteFunctions, i: number, name: string, label: string): unknown[] {
	const result = parseJsonArray(this.getNodeParameter(name, i, '[]'), label);
	if (!result.ok) {
		throw new NodeOperationError(this.getNode(), result.message, { itemIndex: i });
	}
	return result.value;
}

function parseDefaultValue(this: IExecuteFunctions, i: number): unknown {
	const result = parseJsonParameter(this.getNodeParameter('defaultValue', i, 'null'), 'Default Value');
	if (!result.ok) {
		throw new NodeOperationError(this.getNode(), result.message, { itemIndex: i });
	}
	return result.value === undefined ? null : result.value;
}

function buildBody(this: IExecuteFunctions, i: number, uuid?: string): IDataObject {
	const fieldKey =
		this.getNodeParameter('operation', i) === 'update'
			? (this.getNodeParameter('fieldKey', i) as string).trim()
			: undefined;

	if (uuid && !fieldKey) {
		throw new NodeOperationError(this.getNode(), 'Update field definition: Field Key is required.', {
			itemIndex: i,
		});
	}

	return buildFieldDefinitionBody({
		uuid,
		fieldKey,
		fieldTypeName: this.getNodeParameter('fieldTypeName', i) as string,
		constraints: parseArrayInput.call(this, i, 'constraints', 'Field Type Constraints'),
		label: this.getNodeParameter('label', i) as string,
		attributes: parseArrayInput.call(this, i, 'attributes', 'Attributes'),
		relations: parseArrayInput.call(this, i, 'relations', 'Relations'),
		comment: ((this.getNodeParameter('comment', i, '') as string) || null),
		defaultValue: parseDefaultValue.call(this, i),
		possibleValues: parseArrayInput.call(this, i, 'possibleValues', 'Possible Values'),
	});
}

async function fetchFieldDefinition(
	this: IExecuteFunctions,
	template: AssetTrackingTemplate,
	uuid: string,
): Promise<IDataObject> {
	return (await seventhingsApiRequest.call(this, {
		path: fieldDefinitionPath(template, uuid),
	})) as IDataObject;
}

const handlers: Record<string, FieldDefinitionHandler> = {
	async create(this: IExecuteFunctions, i: number) {
		const template = getTemplate.call(this, i);
		const body = buildBody.call(this, i);
		const response = (await seventhingsApiRequest.call(this, {
			method: 'POST',
			path: fieldDefinitionPath(template),
			body,
			headers: { 'Content-Type': 'application/json' },
			returnFullResponse: true,
		})) as { body?: IDataObject; headers?: IDataObject };

		const uuid =
			uuidFromLocation(locationHeader(response.headers)) ??
			(response.body?.uuid as string | undefined);
		const json = uuid ? await fetchFieldDefinition.call(this, template, uuid) : { ...body, created: true };
		return [{ json, pairedItem: { item: i } }];
	},

	async update(this: IExecuteFunctions, i: number) {
		const template = getTemplate.call(this, i);
		const uuid = getFieldDefinitionUuid.call(this, i);
		const body = buildBody.call(this, i, uuid);
		await seventhingsApiRequest.call(this, {
			method: 'PUT',
			path: fieldDefinitionPath(template, uuid),
			body,
			headers: { 'Content-Type': 'application/json' },
		});
		const json = await fetchFieldDefinition.call(this, template, uuid);
		return [{ json, pairedItem: { item: i } }];
	},

	async get(this: IExecuteFunctions, i: number) {
		const template = getTemplate.call(this, i);
		const uuid = getFieldDefinitionUuid.call(this, i);
		const json = await fetchFieldDefinition.call(this, template, uuid);
		return [{ json, pairedItem: { item: i } }];
	},

	async getAll(this: IExecuteFunctions, i: number) {
		const template = getTemplate.call(this, i);
		const defs = await fetchFieldDefinitions.call(this, template);
		return defs.map((json) => ({ json: json as IDataObject, pairedItem: { item: i } }));
	},
};

export function isFieldDefinitionOperationSupported(operation: string): boolean {
	return operation in handlers;
}

export async function executeFieldDefinitionOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	const handler = handlers[operation];
	if (!handler) {
		throw new NodeOperationError(
			this.getNode(),
			`The field definition operation "${operation}" is not implemented yet.`,
			{ itemIndex: i },
		);
	}
	return handler.call(this, i);
}
