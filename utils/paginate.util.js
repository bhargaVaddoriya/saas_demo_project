/**
 * Common pagination, sorting, and filtering utility for Mongoose models.
 * 
 * Supports two flexible calling patterns:
 * 1. Single config object:
 *    paginate(Model, { filter, queryParams: req.query, searchFields, populate, select, defaultSort })
 * 
 * 2. Payload + options:
 *    paginate(Model, req.query, { filter, searchFields, populate, select, defaultSort })
 * 
 * @param {import('mongoose').Model} model - Mongoose model to query
 * @param {Object} payload - Unified options or req.query object
 * @param {Object} [extraOptions] - Filter and query options if payload is req.query
 * @returns {Promise<{ data: Array, pagination: Object }>}
 */
const paginate = async (model, payload = {}, extraOptions = {}) => {
  let queryParams = {};
  let options = {};

  // Check which calling style was used
  if (payload.queryParams !== undefined || payload.filter !== undefined || payload.searchFields !== undefined) {
    queryParams = payload.queryParams || {};
    options = payload;
  } else {
    queryParams = payload || {};
    options = extraOptions || {};
  }

  const {
    filter = {},
    searchFields = [],
    populate = [],
    select = '',
    defaultSort = { createdAt: -1 },
    maxLimit = 100,
    defaultLimit = 20,
  } = options;

  // 1. Build Filter Object
  const finalFilter = { ...filter };

  // 2. Handle Text Search across searchFields
  const search = typeof queryParams.search === 'string' ? queryParams.search.trim() : '';
  if (search && Array.isArray(searchFields) && searchFields.length > 0) {
    const searchConditions = searchFields.map((field) => ({
      [field]: { $regex: search, $options: 'i' },
    }));

    if (finalFilter.$or) {
      finalFilter.$and = finalFilter.$and || [];
      finalFilter.$and.push({ $or: finalFilter.$or }, { $or: searchConditions });
      delete finalFilter.$or;
    } else {
      finalFilter.$or = searchConditions;
    }
  }

  // 3. Handle Sorting
  let sortCriteria = defaultSort;
  const sortBy = queryParams.sortBy || queryParams.sort;
  if (sortBy) {
    const rawOrder = queryParams.order || queryParams.sortOrder || 'desc';
    const orderDirection = rawOrder.toString().toLowerCase() === 'asc' ? 1 : -1;
    sortCriteria = { [sortBy]: orderDirection };
  }

  // 4. Handle Pagination Numbers
  const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(queryParams.limit, 10) || defaultLimit));
  const skip = (page - 1) * limit;

  // 5. Construct & Execute Mongoose Query
  let query = model.find(finalFilter);

  if (select) {
    query = query.select(select);
  }

  if (populate) {
    if (Array.isArray(populate)) {
      populate.forEach((popItem) => {
        if (popItem) query = query.populate(popItem);
      });
    } else {
      query = query.populate(populate);
    }
  }

  query = query.sort(sortCriteria).skip(skip).limit(limit);

  const [data, total] = await Promise.all([
    query.exec(),
    model.countDocuments(finalFilter),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
};

module.exports = { paginate };
