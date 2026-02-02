const OtpModel = require('../model/otp.model');

const OTP_EXPIRY_MS = 15 * 60 * 1000

const createOtp = async (email) => {
    const generateOtp = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS)
    const newOtp = await OtpModel.findOneAndUpdate(
        { email },
        { email, otp: generateOtp, expiresAt },
        { upsert: true, new: true }
    )
    return newOtp
}

const verifyOtp = async (email, otpCode) => {
    const findOtp = await OtpModel.findOne({ email, otp: otpCode })
    if(!findOtp){
        return false
    }
    await findOtp.deleteOne()
    return true
}

module.exports = { createOtp, verifyOtp }
