import mongoose from 'mongoose';

var Schema = mongoose.Schema;

var WatchListModelSchema = new Schema({
    address: { type: String, unique: true },
    name: String,
    first_trade_block: Number,
    first_mint_block: Number,
    trade_history_finished: Boolean,
    min_history_finished: Boolean,
    total_profit: Number,
    profit: Number,
    spent: Number,
    revenue: Number,
    nfts_bought: Number,
    nfts_sold: Number,
    collections_bought: Number,
    collections_sold: Number
});

// Compile model from schema
export default mongoose.model('WatchList', WatchListModelSchema );
