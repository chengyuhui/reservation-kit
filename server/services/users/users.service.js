const createService = require('feathers-mongoose')

const Model = require('../../models/users.model')

const hooks = require('./users.hooks')

module.exports = function(app) {
  app.use(
    '/users',
    createService({
      Model,
      lean: true,
      paginate: {
        default: 10,
        max: 25
      }
    })
  )

  const service = app.service('users')
  service.hooks(hooks)
}
