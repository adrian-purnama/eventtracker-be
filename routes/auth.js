require('dotenv').config();
const jwt = require('jsonwebtoken');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const system = require('../model/system.model');
const user = require('../model/user.model');
const { createOtp, verifyOtp } = require('../helper/otp.helper');
const { sendOtpEmail } = require('../helper/email.helper');
const { validateToken } = require('../helper/validate.helper');

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
    const { email } = req.body;
    if(!email){
        return res.status(400).json({
            success : false,
            message : "Email is required"
        })
    }
    const newOtp = await createOtp(email)
    await sendOtpEmail(email, newOtp.otp)
    return res.status(200).json({
        success : true,
        message : "OTP sent successfully"
    })
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

    if(await user.findOne({ email })){
        return res.status(400).json({
            success : false,
            message : "Email already exists"
        })
    }

    const isValidOtp = await verifyOtp(email, otp)
    if(!isValidOtp){
        return res.status(400).json({
            success : false,
            message : "Invalid OTP"
        })
    }

    const normalizedName = String(name)
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

    const hashedPassword = await bcrypt.hash(password, 10)
    const newUser = await user.create({ email, name: normalizedName, password: hashedPassword })

    return res.status(200).json({
        success : true,
        message : "User created successfully",
        data : { id: newUser._id, email: newUser.email, name: newUser.name }
    })

})


router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if(!email || !password){
        return res.status(400).json({
            success : false,
            message : "Email and password are required"
        })
    }

    const findUser = await user.findOne({ email })
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

    if(email !=  "adrianpurnama209@gmail.com"){
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

module.exports = router;