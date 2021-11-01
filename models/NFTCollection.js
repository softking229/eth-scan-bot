import mongoose from 'mongoose';
import autoIncrement from 'mongoose-auto-increment'

var Schema = mongoose.Schema;

autoIncrement.initialize(mongoose.connection);
var NFTCollectionModelSchema = new Schema({
    contractHash: { type: String, unique: true },
    name: String,
    firstBlock: Number,
    lastCheckedBlock: Number,
    latestTimeStamp: Number
});

NFTCollectionModelSchema.plugin(autoIncrement.plugin, 'NFTCollection');
// Compile model from schema
export default mongoose.model('NFTCollection', NFTCollectionModelSchema );