import mongoose from 'mongoose';

var Schema = mongoose.Schema;

var TransactionHistoryModelSchema = new Schema({
    transactionHash: { type: String, unique: true },
    blockNumber: Number,
    from: String,
    to: String,
    tokenNumber: Number,
    tokenName: String,
    tokenSymbol: String,
    value: Number,
    timestamp: Number,
    type: String,
    gasPrice: Number,
    gasUsed: Number
});

// Compile model from schema
export default mongoose.model('TransactionHistory', TransactionHistoryModelSchema );