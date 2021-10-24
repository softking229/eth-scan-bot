import mongoose from 'mongoose';

var Schema = mongoose.Schema;

var OnChainInfoModelSchema = new Schema({
    lastBlock: Number
});

// Compile model from schema
export default mongoose.model('OnChainInfo', OnChainInfoModelSchema);