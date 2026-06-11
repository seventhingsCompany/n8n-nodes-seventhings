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
