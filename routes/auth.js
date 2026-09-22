require('dotenv').config();
const jwt = require('jsonwebtoken');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const system = require('../model/system.model');
const user = require('../model/user.model');
const invitation = require('../model/invitation.model');
const { createOtp, verifyOtp } = require('../helper/otp.helper');
const { sendOtpEmail, sendPasswordResetOtpEmail } = require('../helper/email.helper');
const { validateToken, requireAdrian } = require('../helper/validate.helper');

const normalizeName = (name) =>
    String(name)
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

const normalizeEmail = (email) => String(email).trim().toLowerCase();

router.get('/check-registration', async (req, res) => {
    const findSystem = await system.findOne({})
    
    if(!findSystem || !findSystem.openRegistration){
        return res.status(404).json({
            success : false,
            message : "System not found or registration is closed"
        })
    }

    return res.status(200).json({
        success : true,
        message : "Registration is open"
    })
})

router.post('/send-otp', async (req, res) => {
    try {
        const { email } = req.body;
        if(!email){
            return res.status(400).json({
                success : false,
                message : "Email is required"
            })
        }
        const normalizedEmail = normalizeEmail(email)
        const newOtp = await createOtp(normalizedEmail)
        await sendOtpEmail(normalizedEmail, newOtp.otp)
        return res.status(200).json({
            success : true,
            message : "OTP sent successfully"
        })
    } catch (err) {
        console.error('send-otp error:', err?.response?.body || err?.response?.data || err.message)
        return res.status(500).json({
            success : false,
            message : "Failed to send OTP"
        })
    }
})


router.post('/register', async (req, res) => {

    const checkRegistration = await system.findOne({})
    if(!checkRegistration || !checkRegistration.openRegistration){
        return res.status(400).json({
            success : false,
            message : "Registration is closed"
        })
    }

    const { email, password, otp, name } = req.body;
    if(!email || !password || !otp || !name){
        return res.status(400).json({
            success : false,
            message : "Email, full name, password and OTP are required"
        })
    }

    const normalizedEmail = normalizeEmail(email)

    if(await user.findOne({ email: normalizedEmail })){
        return res.status(400).json({
            success : false,
            message : "Email already exists"
        })
    }

    const isValidOtp = await verifyOtp(normalizedEmail, otp)
    if(!isValidOtp){
        return res.status(400).json({
            success : false,
            message : "Invalid OTP"
        })
    }

    const isFirstUser = (await user.countDocuments({})) === 0
    const hashedPassword = await bcrypt.hash(password, 10)
    const newUser = await user.create({
        email: normalizedEmail,
        name: normalizeName(name),
        password: hashedPassword,
        isAdmin: isFirstUser
    })

    return res.status(200).json({
        success : true,
        message : "User created successfully",
        data : { id: newUser._id, email: newUser.email, name: newUser.name, isAdmin: newUser.isAdmin }
    })

})

// Create invitation link (admin / adrian only)
router.post('/invitation', validateToken, requireAdrian, async (req, res) => {
    try {
        const invite = await invitation.create({ createdBy: req.user._id })
        return res.status(200).json({
            success: true,
            message: 'Invitation created',
            data: {
                id: invite._id,
                token: invite.token,
                createdAt: invite.createdAt,
            },
        })
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message || 'Failed to create invitation',
        })
    }
})

// List invitations (admin / adrian only)
router.get('/invitation', validateToken, requireAdrian, async (req, res) => {
    try {
        const invites = await invitation
            .find({})
            .sort({ createdAt: -1 })
            .limit(50)
            .populate('usedBy', 'email name')
            .lean()
        return res.status(200).json({
            success: true,
            data: invites,
        })
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message || 'Failed to list invitations',
        })
    }
})

// Validate invitation token (public)
router.get('/invitation/:token', async (req, res) => {
    try {
        const invite = await invitation.findOne({ token: req.params.token })
        if (!invite || invite.used) {
            return res.status(400).json({
                success: false,
                message: 'Invitation is invalid or already used',
            })
        }
        return res.status(200).json({
            success: true,
            message: 'Invitation is valid',
        })
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message || 'Failed to validate invitation',
        })
    }
})

// Register via invitation — bypasses openRegistration, no OTP
router.post('/register-invite', async (req, res) => {
    try {
        const { token, email, password, name } = req.body
        if (!token || !email || !password || !name) {
            return res.status(400).json({
                success: false,
                message: 'Invitation token, email, full name and password are required',
            })
        }

        const invite = await invitation.findOne({ token })
        if (!invite || invite.used) {
            return res.status(400).json({
                success: false,
                message: 'Invitation is invalid or already used',
            })
        }

        const normalizedEmail = normalizeEmail(email)
        if (await user.findOne({ email: normalizedEmail })) {
            return res.status(400).json({
                success: false,
                message: 'Email already exists',
            })
        }

        const isFirstUser = (await user.countDocuments({})) === 0
        const hashedPassword = await bcrypt.hash(password, 10)
        const newUser = await user.create({
            email: normalizedEmail,
            name: normalizeName(name),
            password: hashedPassword,
            isAdmin: isFirstUser,
        })

        invite.used = true
        invite.usedBy = newUser._id
        invite.usedAt = new Date()
        await invite.save()

        return res.status(200).json({
            success: true,
            message: 'User created successfully',
            data: { id: newUser._id, email: newUser.email, name: newUser.name, isAdmin: newUser.isAdmin },
        })
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message || 'Registration failed',
        })
    }
})


router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if(!email || !password){
        return res.status(400).json({
            success : false,
            message : "Email and password are required"
        })
    }

    const normalizedEmail = normalizeEmail(email)
    const findUser = await user.findOne({ email: normalizedEmail })
    if(!findUser){
        return res.status(400).json({
            success : false,
            message : "Invalid email or password"
        })
    }
    const isPasswordValid = await bcrypt.compare(password, findUser.password)
    if(!isPasswordValid){
        return res.status(400).json({
            success : false,
            message : "Invalid email or password"
        })
    }

    const token = jwt.sign({ id: findUser._id, email: findUser.email }, process.env.JWT_SECRET, { expiresIn: '7d' })

    return res.status(200).json({
        success : true,
        message : "Login successful",
        data : { email: findUser.email, token }
    })
})

router.get('/verify-token', validateToken, (req, res) => {
    return res.status(200).json({
        success : true,
        message : "Token verified",
        data : { email: req.user.email }
    })
})

router.get('/adrian', validateToken, (req, res) => {
    const email = req.user.email;

    if(email !== "adrianpurnama209@gmail.com" && req.user.isAdmin !== true){
        return res.status(400).json({
            success : false,
            message : "You are not authorized to access this resource"
        })
    }

    return res.status(200).json({
        success: true,
        data: { user: req.user, email },
    });
});

router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required',
            })
        }

        const normalizedEmail = normalizeEmail(email)
        const findUser = await user.findOne({ email: normalizedEmail })

        // Always return success so we don't reveal whether the email exists
        if (findUser) {
            const newOtp = await createOtp(normalizedEmail)
            await sendPasswordResetOtpEmail(normalizedEmail, newOtp.otp)
        }

        return res.status(200).json({
            success: true,
            message: 'If that email exists, a reset code has been sent',
        })
    } catch (err) {
        console.error('forgot-password error:', err?.response?.body || err?.response?.data || err.message)
        return res.status(500).json({
            success: false,
            message: 'Failed to process password reset request',
        })
    }
})

router.post('/reset-password', async (req, res) => {
    try {
        const { email, otp, password } = req.body
        if (!email || !otp || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email, OTP and new password are required',
            })
        }

        if (String(password).length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters',
            })
        }

        const normalizedEmail = normalizeEmail(email)
        const findUser = await user.findOne({ email: normalizedEmail })
        if (!findUser) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email or OTP',
            })
        }

        const isValidOtp = await verifyOtp(normalizedEmail, otp)
        if (!isValidOtp) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired OTP',
            })
        }

        findUser.password = await bcrypt.hash(password, 10)
        await findUser.save()

        return res.status(200).json({
            success: true,
            message: 'Password reset successfully',
        })
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message || 'Failed to reset password',
        })
    }
})

module.exports = router;
