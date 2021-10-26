import mongoose from 'mongoose';

var Schema = mongoose.Schema;

var LogModelSchema = new Schema({
    address: String,
    topics: Array,
    data: { type: String, default: "0x"},
    blockNumber: Number,
    timeStamp: Number,
    gasPrice: Number,
    gasUsed: Number,
    logIndex: Number,
    transactionHash: String,
    transactionIndex: Number
});

LogModelSchema.index({ logIndex: 1, transactionHash: 1}, { unique: true });

// Compile model from schema
export default mongoose.model('Log', LogModelSchema );