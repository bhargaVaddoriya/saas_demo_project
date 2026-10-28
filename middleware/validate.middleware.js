const { validationResult } = require('express-validator');

/**
 * Middleware factory to execute express-validator rules and return standard error responses.
 * 
 * @param {Array} validations Array of express-validator chains (body, param, query)
 */
const validate = (validations) => {
  return async (req, res, next) => {
    // Run all validation rules in parallel
    await Promise.all(validations.map((validation) => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    const formattedErrors = errors.array().map((err) => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value,
    }));

    return res.status(400).json({
      success: false,
      message: formattedErrors[0]?.message || 'Validation failed.',
      errors: formattedErrors,
    });
  };
};

module.exports = { validate };
