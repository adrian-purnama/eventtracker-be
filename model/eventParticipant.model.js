const mongoose = require('mongoose');

const eventParticipantSchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'event',
      required: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    present: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

eventParticipantSchema.index({ event: 1 });

module.exports = mongoose.model('eventParticipant', eventParticipantSchema);
