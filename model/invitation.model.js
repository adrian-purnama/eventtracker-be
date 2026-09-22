const mongoose = require('mongoose');
const crypto = require('crypto');

const invitationSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true,
        unique: true,
        default: () => crypto.randomBytes(24).toString('hex'),
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true,
    },
    used: {
        type: Boolean,
        default: false,
    },
    usedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        default: null,
    },
    usedAt: {
        type: Date,
        default: null,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('invitation', invitationSchema);
