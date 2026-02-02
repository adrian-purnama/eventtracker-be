const mongoose = require('mongoose');

const runDownItemSchema = new mongoose.Schema(
  {
    timeStart: { type: String, required: true }, // e.g. "09:00"
    timeEnd: { type: String, required: true },   // e.g. "09:30"
    durationMinutes: { type: Number, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
  },
  { _id: false }
);

const budgetItemSchema = new mongoose.Schema(
  {
    item: { type: String, required: true },
    type: { type: String, required: true, enum: ['income', 'outcome'] },
    qty: { type: Number, required: true, default: 1 },
    pricePerQty: { type: Number, required: true },
    description: { type: String, default: '' },
    category: { type: String, required: true }
  },
  { _id: false }
);

const eventLogSchema = new mongoose.Schema(
  {
    logMessage: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const eventSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  activityType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'activityType',
    required: true,
  },
  activity: {
    type: [String],
    default: [],
  },
  purpose: {
    type: [String],
    default: [],
  },
  activityDate: {
    type: Date,
  },
  activityTime: {
    startTime: { type: String},
    endTime: { type: String },
    untilFinish: { type: Boolean, default: false }, 
  },
  activityLocation: {
    type: String,
  },
  targetAudience: {
    type: Number,
    default: 0,
  },
  committee: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
    default: [],
  },
  runDown: {
    type: [runDownItemSchema],
    default: [],
  },
  budget: {
    type: [budgetItemSchema],
    default: [],
  },
  collaborators: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'user' }],
    default: [],
  },
  eventCreator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true,
  },
  eventApprover: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
  },
  eventManager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
  },
  eventLog : {
    type: [eventLogSchema],
    default: [],
  },
});

module.exports = mongoose.model('event', eventSchema);
