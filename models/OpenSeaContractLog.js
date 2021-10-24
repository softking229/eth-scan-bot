import mongoose from 'mongoose';

var Schema = mongoose.Schema;

var OpenSeaContractLogModelSchema = new Schema({
    transactionHash: { type: String, unique: true },
    blockNumber: Number,
    from: String,
    to: String,
    tokenNumber: Number,
    tokenName: String,
    value: Number,
    timestamp: Number,
    type: String
});

// Compile model from schema
export default mongoose.model('OpenSeaContractLog', OpenSeaContractLogModelSchema );