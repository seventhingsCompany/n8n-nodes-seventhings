/**
 * Node `methods` registry: loadOptions, listSearch and resourceMapper handlers
 * referenced by the resource descriptions. Aggregated here so the node class can
 * register them in one place.
 */

import { assetListSearch, assetLoadOptions, assetResourceMapping } from './assetMethods';
import { rentalCaseListSearch } from './rentalCaseMethods';
import { taskListSearch } from './taskMethods';
import { locationListSearch, locationLoadOptions } from './locationMethods';
import { roomListSearch, roomResourceMapping } from './roomMethods';
import { fileListSearch } from './fileMethods';
import { personListSearch, personResourceMapping } from './personMethods';
import { userListSearch } from './userMethods';
import { fieldDefinitionListSearch } from './fieldDefinitionMethods';
import { circularityHubListSearch } from './circularityHubMethods';

export const loadOptions = {
	...assetLoadOptions,
	...locationLoadOptions,
};

export const listSearch = {
	...assetListSearch,
	...taskListSearch,
	...rentalCaseListSearch,
	...locationListSearch,
	...roomListSearch,
	...fileListSearch,
	...personListSearch,
	...userListSearch,
	...fieldDefinitionListSearch,
	...circularityHubListSearch,
};

export const resourceMapping = {
	...assetResourceMapping,
	...roomResourceMapping,
	...personResourceMapping,
};
