const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const env = require('../config/env');

const RISK_LEVELS = ['LOW', 'MODERATE', 'HIGH'];

const userSchema = new mongoose.Schema(
    {
        fullName: { type: String, required: true, trim: true, maxlength: 100 },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true, // "Alice@x.com" and "alice@x.com" are the same account
            trim: true,
            maxlength: 254,
        },
        // select:false => the hash is never returned unless explicitly requested
        password: { type: String, required: true, select: false },
        risk_preference: { type: String, enum: RISK_LEVELS, default: 'MODERATE' },
    },
    { timestamps: true }
);

userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, env.bcryptRounds);
});

// Requires the document to have been loaded with .select('+password')
userSchema.methods.comparePassword = function (candidate) {
    return bcrypt.compare(candidate, this.password);
};

userSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.password;
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model('User', userSchema);
module.exports.RISK_LEVELS = RISK_LEVELS;
