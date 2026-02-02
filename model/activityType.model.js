const mongoose = require('mongoose');

const activityTypeSchema = new mongoose.Schema({
    name : {
        type : String,
        required : true
    },
    description : {
        type : String,
        required : true
    },
    active : {
        type : Boolean,
        required : true,
        default : true
    }
})

module.exports = mongoose.model('activityType', activityTypeSchema);