/**
 * Validate and sanitise req.params / req.query / req.body with Zod schemas.
 * Parsed (typed, trimmed, unknown-keys-stripped) values are placed on
 * `req.valid` - controllers must read from there, never from raw req.body.
 *
 * Because every field is parsed as a specific primitive type, operator objects
 * such as {"email": {"$ne": null}} are rejected, which prevents NoSQL injection.
 */
const validate = (schemas) => (req, res, next) => {
    req.valid = {};
    if (schemas.params) req.valid.params = schemas.params.parse(req.params);
    if (schemas.query) req.valid.query = schemas.query.parse(req.query);
    if (schemas.body) req.valid.body = schemas.body.parse(req.body ?? {});
    next();
};

module.exports = validate;
