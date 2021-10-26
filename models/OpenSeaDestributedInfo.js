import mongoose from 'mongoose';

var Schema = mongoose.Schema;

var OpenSeaDestributedInfoModelSchema = new Schema({
    fromBlock: Number,
    toBlock: {type: Number, unique: true},
    finished: Boolean,
    deviceNumber: Number
});
//OpenSeaDestributedInfoModelSchema.index({ fromBlock: 1, toBlock: 1 }, { unique: true })
// Compile model from schema
export default mongoose.model('OpenSeaDestributedInfo', OpenSeaDestributedInfoModelSchema);