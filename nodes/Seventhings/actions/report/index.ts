import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { seventhingsApiRequest, validateUuid } from '../../transport';

type ReportHandler = (this: IExecuteFunctions, i: number) => Promise<INodeExecutionData[]>;

const handlers: Record<string, ReportHandler> = {
	async getTemplates(this: IExecuteFunctions, i: number) {
		const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
		const limit = returnAll ? Number.POSITIVE_INFINITY : (this.getNodeParameter('limit', i, 50) as number);
		if (!returnAll && (!Number.isInteger(limit) || limit < 1)) {
			throw new NodeOperationError(this.getNode(), 'Limit must be a positive integer.', { itemIndex: i });
		}
		const templates = (await seventhingsApiRequest.call(this, {
			path: '/customer-api/v1/report-template',
		})) as IDataObject[];
		return templates.slice(0, limit).map((json) => ({ json, pairedItem: { item: i } }));
	},

	async create(this: IExecuteFunctions, i: number) {
		let templateUuid: string;
		let assetUuids: string[];
		try {
			templateUuid = validateUuid(
				this.getNodeParameter('reportTemplateId', i, undefined, { extractValue: true }),
				'Report Template UUID',
			);
			const input = this.getNodeParameter('assetUuids', i, '');
			const values = Array.isArray(input) ? input : typeof input === 'string' ? input.split(',') : [];
			if (values.length === 0) throw new Error('At least one Asset UUID is required.');
			assetUuids = values.map((value) => validateUuid(value, 'Asset UUID'));
		} catch (error) {
			throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
		}
		const binaryPropertyName = (this.getNodeParameter('binaryPropertyName', i, 'data') as string).trim();
		if (!binaryPropertyName) {
			throw new NodeOperationError(this.getNode(), 'Output Binary Field is required.', { itemIndex: i });
		}
		const fileName = (this.getNodeParameter('fileName', i, 'report.pdf') as string).trim() || 'report.pdf';
		const body = { report_template_uuid: templateUuid, object_uuids: assetUuids };
		// Serialize explicitly: JSON response handling is disabled to preserve PDF bytes.
		const response = (await seventhingsApiRequest.call(this, {
			method: 'POST',
			path: '/customer-api/v1/report',
			body: JSON.stringify(body),
			headers: { Accept: 'application/pdf', 'Content-Type': 'application/json' },
			json: false,
			encoding: 'arraybuffer',
		})) as Buffer | ArrayBuffer;
		const buffer = Buffer.isBuffer(response) ? response : Buffer.from(response);
		const binaryData = await this.helpers.prepareBinaryData(buffer, fileName, 'application/pdf');
		return [{
			json: { ...body, file_name: fileName, binary_property: binaryPropertyName },
			binary: { [binaryPropertyName]: binaryData },
			pairedItem: { item: i },
		}];
	},
};

export function isReportOperationSupported(operation: string): boolean {
	return Object.prototype.hasOwnProperty.call(handlers, operation);
}

export async function executeReportOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<INodeExecutionData[]> {
	return handlers[operation].call(this, i);
}
