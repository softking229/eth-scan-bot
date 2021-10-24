import mongoose from 'mongoose';

var Schema = mongoose.Schema;

var OpenSeaDeviceInfoModelSchema = new Schema({
    LastDeviceNumber: { type:Number, unique: true}
});

// Compile model from schema
export default mongoose.model('OpenSeaDeviceInfo', OpenSeaDeviceInfoModelSchema);