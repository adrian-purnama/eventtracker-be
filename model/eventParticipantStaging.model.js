const mongoose = require('mongoose');

const eventParticipantStagingSchema = new mongoose.Schema(
  {
    instanceId: {
      type: String,
      required: true,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'event',
      required: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Auto-delete 10 minutes after creation
eventParticipantStagingSchema.index({ createdAt: 1 }, { expireAfterSeconds: 600 });
eventParticipantStagingSchema.index({ instanceId: 1 });

module.exports = mongoose.model('eventParticipantStaging', eventParticipantStagingSchema);
