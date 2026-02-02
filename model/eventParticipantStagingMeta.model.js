const mongoose = require('mongoose');

const eventParticipantStagingMetaSchema = new mongoose.Schema(
  {
    instanceId: {
      type: String,
      required: true,
      unique: true,
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
    columnNames: {
      type: [String],
      default: [],
    }
  },
  { timestamps: true }
);

// Auto-delete 10 minutes after creation
eventParticipantStagingMetaSchema.index({ createdAt: 1 }, { expireAfterSeconds: 600 });

module.exports = mongoose.model('eventParticipantStagingMeta', eventParticipantStagingMetaSchema);
