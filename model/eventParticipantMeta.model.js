const mongoose = require('mongoose');

const eventParticipantMetaSchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'event',
      required: true,
      unique: true,
    },
    columnNames: {
      type: [String],
      default: [],
    },
    searchableFields: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('eventParticipantMeta', eventParticipantMetaSchema);
