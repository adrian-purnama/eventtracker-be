const mongoose = require('mongoose');

const systemSchema = new mongoose.Schema({
    appName : {
        type : String,
        required : true,
        default : "FC"
    },
    openRegistration : {
        type : Boolean,
        required : true,
        default : false
    }
})

module.exports = mongoose.model('System', systemSchema);