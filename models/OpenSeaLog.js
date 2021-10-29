import mongoose from 'mongoose';

var Schema = mongoose.Schema;

var OpenSeaLogModelSchema = new Schema({
    address: String,
    topics: Array,
    topicsLength: Number,
    data: { type: String, default: "0x"},
    blockNumber: Number,
    timeStamp: Number,
    gasPrice: Number,
    gasUsed: Number,
    logIndex: Number,
    transactionHash: String,
    transactionIndex: Number,
    tokenID: {type: Number, default: -1}
});

OpenSeaLogModelSchema.index({ logIndex: 1, transactionHash: 1}, { unique: true });

// Compile model from schema
export default mongoose.model('OpenSeaLog', OpenSeaLogModelSchema );