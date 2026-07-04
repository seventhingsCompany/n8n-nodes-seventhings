import type { IDataObject } from 'n8n-workflow';

export const FILTER_OPERATOR_OPTIONS = [
	{ name: 'Equals', value: 'eq' },
	{ name: 'Does Not Equal', value: 'neq' },
	{ name: 'Greater Than', value: 'gt' },
	{ name: 'Greater Than Or Equal', value: 'gte' },
	{ name: 'Greater Than Or Equal or Null', value: 'gte_or_null' },
	{ name: 'Greater Than or Null', value: 'gt_or_null' },
	{ name: 'In', value: 'in' },
	{ name: 'Less Than', value: 'lt' },
	{ name: 'Less Than Or Equal', value: 'lte' },
	{ name: 'Less Than Or Equal or Null', value: 'lte_or_null' },
	{ name: 'Less Than or Null', value: 'lt_or_null' },
	{ name: 'Like', value: 'like' },
	{ name: 'Not In', value: 'nin' },
	{ name: 'Not Like', value: 'not_like' },
] satisfies Array<{ name: string; value: string }>;

export const SORT_DIRECTION_OPTIONS = [
	{ name: 'Ascending', value: 'ASC' },
	{ name: 'Descending', value: 'DESC' },
] satisfies Array<{ name: string; value: string }>;

export const LOWERCASE_SORT_DIRECTION_OPTIONS = [
	{ name: 'Ascending', value: 'asc' },
	{ name: 'Descending', value: 'desc' },
] satisfies Array<{ name: string; value: string }>;

export type FilterOperator = string;
export type SortDirection = string;

export interface SdkFilterEntry {
	field: string;
	operator: FilterOperator;
	values: string[];
}

export interface SdkSortEntry {
	field: string;
	direction: SortDirection;
}

export interface SdkListOptions {
	page?: number;
	perPage?: number;
	sort?: SdkSortEntry[];
	filters?: SdkFilterEntry[];
}

const MULTI_VALUE_OPERATORS = new Set<FilterOperator>([
	'like',
	'not_like',
	'in',
	'nin',
]);

function isPresent(value: unknown): boolean {
	return value !== undefined && value !== null && value !== '';
}

export function isMultiValueOperator(operator: string): boolean {
	return MULTI_VALUE_OPERATORS.has(operator as FilterOperator);
}

export function valuesFromUnknown(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter(isPresent).map(String);
	}
	if (!isPresent(value)) {
		return [];
	}
	return String(value)
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);
}

export function encodeSdkListOptions(options: SdkListOptions): IDataObject {
	const qs: IDataObject = {};

	if (options.page && options.page > 0) {
		qs.page = options.page;
	}
	if (options.perPage && options.perPage > 0) {
		qs.per_page = options.perPage;
	}

	for (const sort of options.sort ?? []) {
		if (sort.field && sort.direction) {
			qs[`sort[${sort.field}]`] = sort.direction;
		}
	}

	for (const filter of options.filters ?? []) {
		if (!filter.field || !filter.operator) {
			continue;
		}
		const values = filter.values.filter(isPresent);
		if (values.length === 0) {
			continue;
		}
		if (isMultiValueOperator(filter.operator)) {
			qs[`filter[${filter.field}][${filter.operator}][]`] = values;
		} else {
			qs[`filter[${filter.field}][${filter.operator}]`] = values[0];
		}
	}

	return qs;
}

export function buildFilterObject(
	filters: SdkFilterEntry[] = [],
	sort: SdkSortEntry[] = [],
): IDataObject {
	const body: IDataObject = {};
	const filterBody: IDataObject = {};
	const sortBody: IDataObject = {};

	for (const filter of filters) {
		if (!filter.field || !filter.operator) {
			continue;
		}
		const values = filter.values.filter(isPresent);
		if (values.length === 0) {
			continue;
		}
		filterBody[filter.field] = {
			...(filterBody[filter.field] as IDataObject | undefined),
			[filter.operator]: isMultiValueOperator(filter.operator) ? values : values[0],
		};
	}

	for (const entry of sort) {
		if (entry.field && entry.direction) {
			sortBody[entry.field] = entry.direction;
		}
	}

	if (Object.keys(filterBody).length > 0) {
		body.filter = filterBody;
	}
	if (Object.keys(sortBody).length > 0) {
		body.sort = sortBody;
	}

	return body;
}

export function fixedCollectionRows(collection: unknown, key: string): IDataObject[] {
	const group = (collection as Record<string, unknown> | undefined)?.[key];
	if (Array.isArray(group)) {
		return group as IDataObject[];
	}
	if (group && typeof group === 'object') {
		const values = (group as { values?: unknown }).values;
		if (Array.isArray(values)) {
			return values as IDataObject[];
		}
		return [group as IDataObject];
	}
	return [];
}

export function readFilterRows(collection: unknown, key = 'filters'): SdkFilterEntry[] {
	return fixedCollectionRows(collection, key)
		.map((row) => ({
			field: String(row.field ?? '').trim(),
			operator: (row.operator as FilterOperator | undefined) ?? 'eq',
			values: valuesFromUnknown(row.values),
		}))
		.filter((row) => row.field && row.values.length > 0);
}

export function readSortRows(collection: unknown, key = 'sort'): SdkSortEntry[] {
	return fixedCollectionRows(collection, key)
		.map((row) => ({
			field: String(row.field ?? '').trim(),
			direction: (row.direction as SortDirection | undefined) ?? 'ASC',
		}))
		.filter((row) => row.field);
}
