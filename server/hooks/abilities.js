// Based on https://github.com/stalniy/casl-feathersjs-example/blob/master/src/hooks/abilities.js
const { AbilityBuilder, Ability } = require('@casl/ability')
const { toMongoQuery } = require('@casl/mongoose')
const { Forbidden } = require('@feathersjs/errors')
const moment = require('moment')

const TYPE_KEY = Symbol.for('type')

Ability.addAlias('update', 'patch')
Ability.addAlias('read', ['get', 'find'])
Ability.addAlias('delete', 'remove')

function subjectName(subject) {
  if (!subject || typeof subject === 'string') {
    return subject
  }

  return subject[TYPE_KEY]
}

function defineAbilitiesFor(user) {
  const { rules, can } = AbilityBuilder.extract()
  can(['read'], ['rooms', 'seatStatus', 'qrcodes'])
  can('update', 'seatStatus')

  if (user) {
    can(['read'], 'users', { _id: user._id })
    can('read', 'reservations', {
      $or: [
        {
          expired: false
        },
        {
          userId: user._id
        }
      ]
    })

    can('create', 'reservations')
    can('delete', 'reservations', {
      userId: user._id,
      $or: [
        {
          createdAt: {
            $gte: moment()
              .subtract(5, 'minutes')
              .toDate() // Created in less than 5 minutes
          },
          confirmed: false,
          expired: false
        },
        {
          seatId: null
        }
      ]
    })
  }

  if (user && user.admin) {
    can(['manage'], ['users', 'rooms', 'reservations'])
    can('create', 'mailer')
  }

  if (process.env.NODE_ENV !== 'production') {
    can('create', ['users'])
  }

  return new Ability(rules, { subjectName })
}

function canReadQuery(query) {
  return query !== null
}

module.exports = function authorize(name = null) {
  return async function(hook) {
    const action = hook.method
    const service = name ? hook.app.service(name) : hook.service
    const serviceName = name || hook.path
    const ability = defineAbilitiesFor(hook.params.user)
    const model =
      service.options && service.options.Model && service.options.Model

    const throwUnlessCan = (action, resource) => {
      if (ability.cannot(action, resource)) {
        throw new Forbidden(`You are not allowed to ${action} ${serviceName}`)
      }
    }

    hook.params = hook.params || {}
    hook.params.ability = ability

    if (model && model.accessibleFieldsBy) {
      hook.params.abilityFields = model.accessibleFieldsBy(ability, action)
    }

    if (hook.method === 'create') {
      if (Array.isArray(hook.data) && hook.data[0]) {
        hook.data[0][TYPE_KEY] = hook.path
        throwUnlessCan('create', hook.data[0])
        delete hook.data[0][TYPE_KEY]
      } else {
        hook.data[TYPE_KEY] = hook.path
        throwUnlessCan('create', hook.data)
        delete hook.data[TYPE_KEY]
      }
    }

    if (!hook.id) {
      let query = toMongoQuery(ability, serviceName, action)

      if (
        query &&
        typeof query === 'object' &&
        !Array.isArray(query) &&
        Object.keys(query).length === 1 &&
        Array.isArray(query.$or) &&
        query.$or.length === 1
      ) {
        query = query.$or[0]
      }

      if (canReadQuery(query)) {
        Object.assign(hook.params.query, query)
      } else {
        throw new Forbidden(`You are not allowed to ${action} ${serviceName}`)
      }

      return hook
    }

    // Check if the target matches
    const params = Object.assign({}, hook.params, { provider: null })
    let $client = null
    if (params.query && params.query.$client) {
      $client = params.query.$client
      delete params.query.$client
    }
    const result = await service.get(hook.id, params)
    if ($client) {
      params.query.$client = $client
    }

    result[TYPE_KEY] = serviceName
    throwUnlessCan(action, result)

    if (action === 'get') {
      // Simply return
      delete result[TYPE_KEY]
      hook.result = result
    }

    return hook
  }
}
