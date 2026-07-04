/**
 * Public surface of the seventhings transport layer.
 *
 * Every resource (Phases 2–7) imports its API access, timestamp normalization,
 * and validators from here.
 */

export {
	CREDENTIALS_NAME,
	seventhingsApiRequest,
	type SeventhingsApiRequestOptions,
	type SeventhingsRequestContext,
} from './apiRequest';

export { toIsoUtc, toIsoDate, toApiDate, normalizeTimestamps } from './timestamps';

export {
	SUBDOMAIN_RE,
	UUID_RE,
	EMAIL_RE,
	buildBaseUrl,
	validateUuid,
	validateEmail,
	uuidFromLocation,
	locationHeader,
	idFromLocationIdHeader,
} from './validators';

export {
	ASSET_FIELD_DEFINITIONS_PATH,
	fetchAssetFieldDefinitions,
	fieldDefinitionsToResourceMapperFields,
	mapFieldType,
	coerceFieldValues,
	attachmentFieldKeys,
	normalizeAsset,
	type AssetFieldDefinition,
} from './assetFields';

export { normalizeTask } from './taskFields';

export { normalizeRentalCase } from './rentalCaseFields';

export { normalizeLocation } from './locationFields';

export {
	ROOM_FIELD_DEFINITIONS_PATH,
	fetchRoomFieldDefinitions,
	roomFieldDefinitionsToResourceMapperFields,
	coerceRoomFieldValues,
	normalizeRoom,
	type RoomFieldDefinition,
} from './roomFields';

export {
	buildMultipartBody,
	uuidFromUploadLocation,
	uploadFile,
	type UploadFileInput,
} from './fileUpload';

export {
	parseJsonArray,
	parseJsonObject,
	parseJsonParameter,
	type JsonParameterResult,
} from './jsonParameters';

export { normalizeFile } from './fileFields';

export { normalizePerson } from './personFields';

export { normalizeUser } from './userFields';

export {
	normalizeCircularityHubItem,
	normalizeCircularityHubOrder,
} from './circularityHubFields';

export {
	FILTER_OPERATOR_OPTIONS,
	SORT_DIRECTION_OPTIONS,
	LOWERCASE_SORT_DIRECTION_OPTIONS,
	buildFilterObject,
	encodeSdkListOptions,
	fixedCollectionRows,
	isMultiValueOperator,
	readFilterRows,
	readSortRows,
	valuesFromUnknown,
	type FilterOperator,
	type SdkFilterEntry,
	type SdkListOptions,
	type SdkSortEntry,
	type SortDirection,
} from './sdkListOptions';

export {
	FIELD_TYPE_OPTIONS,
	buildFieldDefinitionBody,
	fieldDefinitionPath,
	fieldDefinitionsPath,
	fetchFieldDefinitions,
	fieldDefinitionsToMapperFields,
	type AssetTrackingTemplate,
	type BuildFieldDefinitionInput,
	type FieldDefinition,
} from './fieldDefinitions';
