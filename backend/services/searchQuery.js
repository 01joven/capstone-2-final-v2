// Shared escaping and limits for burial search queries.
// User input like "%%" must not reach ILIKE unescaped, or it matches every record.
// Escape the backslash first, otherwise escaped wildcards would themselves be re-escaped.
const escapeLikePattern = (value) => {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
};

// Anonymous (public) lookups are bulk-scrapeable, so they get a longer minimum
// search length and a smaller result cap than authenticated staff queries.
const ANON_MIN_SEARCH_LENGTH = 3;
const ANON_RESULT_LIMIT = 25;
const AUTHENTICATED_RESULT_LIMIT = 50;

module.exports = {
  escapeLikePattern,
  ANON_MIN_SEARCH_LENGTH,
  ANON_RESULT_LIMIT,
  AUTHENTICATED_RESULT_LIMIT,
};
