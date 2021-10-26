import mongoose from 'mongoose';

var Schema = mongoose.Schema;

var TransactionHistoryModelSchema = new Schema({
    // transactionHash: { type: String, unique: true },
    // blockNumber: Number,
    // from: String,
    // to: String,
    // tokenNumber: Number,
    // tokenName: String,
    // tokenSymbol: String,
    // value: Number,
    // timestamp: Number,
    // type: String,
    // gasPrice: Number,
    // gasUsed: Number
    from_opensea: { type: Boolean, default: false},
    block_hash: { type: String, default: ""},
    block_height: Number,
    block_index: Number,
    hash: {type: String, uniqe: true},
    addresses: Array,
    total: {type: Number, default: 0},
    alt_total: {type: Number, default: 0},
    fees: Number,
    size: Number,
    gas_limit: Number,
    gas_used: Number,
    gas_price: Number,
    gas_tip_cap: Number,
    gas_fee_cap: Number,
    confirmed: Date,
    received: Date,
    ver: Number,
    double_spend: Boolean,
    vin_sz: Number,
    vout_sz: Number,
    internal_txids: {type: Array, default: []},
    confirmations: Number,
    confidence: Number,
    inputs: Array,
    outputs: Array,
    timeStamp: Number
});

// Compile model from schema
export default mongoose.model('TransactionHistory', TransactionHistoryModelSchema );