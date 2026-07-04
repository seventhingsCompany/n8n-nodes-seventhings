import type { IDataObject, ResourceMapperField } from 'n8n-workflow';

import {
	seventhingsApiRequest,
	type SeventhingsRequestContext,
} from './apiRequest';

export type AssetTrackingTemplate = 'asset' | 'room' | 'person';

export const FIELD_TYPE_OPTIONS = [
	{ name: 'Attachment', value: 'ATTACHMENT' },
	{ name: 'Barcode', value: 'BARCODE' },
	{ name: 'Boolean', value: 'BOOLEAN' },
	{ name: 'Coordinates', value: 'COORDINATES' },
	{ name: 'Date', value: 'DATE' },
	{ name: 'Date & Time', value: 'DATETIME' },
	{ name: 'Decimal', value: 'DECIMAL' },
	{ name: 'Dropdown', value: 'DROPDOWN' },
	{ name: 'Field Value Comparison', value: 'FIELD_VALUE_COMPARISON' },
	{ name: 'Link', value: 'LINK' },
	{ name: 'Linked Assets', value: 'LINKED_ASSETS' },
	{ name: 'Linked Location', value: 'LINKED_LOCATION' },
	{ name: 'Linked Person', value: 'LINKED_PERSON' },
	{ name: 'Linked Room', value: 'LINKED_ROOM' },
	{ name: 'Linked User', value: 'LINKED_USER' },
	{ name: 'Long Text', value: 'LONG_TEXT' },
	{ name: 'Money', value: 'MONEY' },
	{ name: 'Number', value: 'NUMBER' },
	{ name: 'Reminder', value: 'REMINDER' },
	{ name: 'Text', value: 'TEXT' },
] satisfies Array<{ name: string; value: string }>;

export interface FieldDefinition {
	uuid?: string;
	field_key?: string;
	field_type?: {
		name?: string;
		constraints?: unknown[];
	};
	label?: string;
	attributes?: unknown[];
	relations?: unknown[];
	comment?: string | null;
	default_value?: unknown;
	possible_values?: unknown[] | null;
}

export interface BuildFieldDefinitionInput {
	uuid?: string;
	fieldKey?: string;
	fieldTypeName: string;
	constraints?: unknown[];
	label: string;
	attributes?: unknown[];
	relations?: unknown[];
	comment?: string | null;
	defaultValue?: unknown;
	possibleValues?: unknown[];
}

export function fieldDefinitionsPath(template: AssetTrackingTemplate): string {
	return `/customer-api/v1/asset-tracking/${template}/field-definitions`;
}

export function fieldDefinitionPath(template: AssetTrackingTemplate, uuid?: string): string {
	const base = `/customer-api/v1/asset-tracking/${template}/field-definition`;
	return uuid ? `${base}/${uuid}` : base;
}

export async function fetchFieldDefinitions(
	this: SeventhingsRequestContext,
	template: AssetTrackingTemplate,
): Promise<FieldDefinition[]> {
	try {
		const response = (await seventhingsApiRequest.call(this, {
			path: fieldDefinitionsPath(template),
		})) as FieldDefinition[] | IDataObject;
		return Array.isArray(response) ? response : [];
	} catch {
		return [];
	}
}

export function buildFieldDefinitionBody(input: BuildFieldDefinitionInput): IDataObject {
	const body: IDataObject = {
		field_type: {
			name: input.fieldTypeName,
			constraints: input.constraints ?? [],
		},
		label: input.label,
		attributes: input.attributes ?? [],
		relations: input.relations ?? [],
		comment: input.comment ?? null,
		default_value: input.defaultValue ?? null,
		possible_values: input.possibleValues ?? [],
	};

	if (input.uuid) {
		body.uuid = input.uuid;
	}
	if (input.fieldKey) {
		body.field_key = input.fieldKey;
	}

	return body;
}

function fieldTypeName(def: FieldDefinition): string | undefined {
	return def.field_type?.name;
}

function mapperType(typeName: string | undefined): ResourceMapperField['type'] {
	switch (typeName) {
		case 'NUMBER':
		case 'DECIMAL':
		case 'MONEY':
			return 'number';
		case 'BOOLEAN':
			return 'boolean';
		case 'DATE':
		case 'DATETIME':
			return 'dateTime';
		default:
			return 'string';
	}
}

export function fieldDefinitionsToMapperFields(
	defs: FieldDefinition[],
	requiredKeys: string[] = [],
): ResourceMapperField[] {
	const required = new Set(requiredKeys);
	return defs
		.filter((def) => def.field_key)
		.map((def) => {
			const key = def.field_key as string;
			const typeName = fieldTypeName(def);
			const field: ResourceMapperField = {
				id: key,
				displayName: def.label ?? key,
				required: required.has(key),
				defaultMatch: false,
				display: true,
				type: mapperType(typeName),
			};
			if (
				typeName === 'DROPDOWN' &&
				Array.isArray(def.possible_values) &&
				def.possible_values.length > 0
			) {
				field.type = 'options';
				field.options = def.possible_values.map((value) => {
					const stringValue = String(value);
					return { name: stringValue, value: stringValue };
				});
			}
			return field;
		});
}
