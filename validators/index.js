const authValidators = require('./auth.validator');
const organizationValidators = require('./organization.validator');
const projectValidators = require('./project.validator');
const taskValidators = require('./task.validator');
const commentValidators = require('./comment.validator');

module.exports = {
  ...authValidators,
  ...organizationValidators,
  ...projectValidators,
  ...taskValidators,
  ...commentValidators,
};
