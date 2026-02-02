const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email : {
        type : String,
        required : true,
        unique : true
    },
    name: {
        type: String,
        required: true
    },
    password : {
        type : String,
        required : true
    },
    approver: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt : {
        type : Date,
        default : Date.now
    }
})

module.exports =  mongoose.model('user', userSchema);