const mongoose = require('mongoose')

const Schema = mongoose.Schema

const schema = new Schema({
  uid: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  admin: {
    type: Boolean,
    default: false
  }
})

module.exports = mongoose.model('User', schema)
